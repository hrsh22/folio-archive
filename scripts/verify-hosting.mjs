import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile, rm, mkdir } from "node:fs/promises";
import path from "node:path";
const origin = process.argv[2] || "https://folio-archive.vercel.app";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const key = (
  await readFile(".runtime/hosting/FOLIO_OWNER_KEY.txt", "utf8")
).trim();
const checks = [];
let cookie = "",
  csrf = "",
  draftId;
async function request(route, method = "GET", body, extra = {}) {
  return fetch(`${origin}/api/${route}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(method !== "GET"
        ? {
            origin,
            "x-folio-session": csrf,
            "content-type":
              body instanceof Uint8Array
                ? "application/octet-stream"
                : "application/json",
          }
        : {}),
      ...extra,
    },
    body:
      body instanceof Uint8Array
        ? body
        : body === undefined
          ? undefined
          : JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
    redirect: "error",
  });
}
async function json(route, method = "GET", body) {
  const response = await request(route, method, body);
  const value = await response.json();
  if (!response.ok)
    throw new Error(`${route}: HTTP ${response.status} ${value.error || ""}`);
  return value;
}
try {
  assert.equal((await request("state")).status, 401);
  checks.push("Anonymous keeper access rejected");
  assert.equal(
    (
      await request("auth", "POST", {
        key: "intentionally-incorrect-test-value",
      })
    ).status,
    401,
  );
  checks.push("Incorrect keeper key rejected");
  const login = await request("auth", "POST", { key });
  if (!login.ok)
    throw new Error(`Login failed: ${login.status} ${await login.text()}`);
  const setCookie = login.headers.get("set-cookie");
  assert.ok(
    setCookie?.includes("HttpOnly") &&
      setCookie.includes("Secure") &&
      setCookie.includes("SameSite=Strict"),
  );
  cookie = setCookie.split(";")[0];
  checks.push("Secure HttpOnly keeper session established");
  const workspace = await json("state");
  csrf = workspace.session;
  assert.ok(csrf && csrf.length === 64);
  assert.equal(
    (
      await request(
        "drafts",
        "POST",
        { title: "Must not exist" },
        { "x-folio-session": "" },
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await request(
        "drafts",
        "POST",
        { title: "Must not exist" },
        { origin: "https://untrusted.example" },
      )
    ).status,
    401,
  );
  checks.push("CSRF and foreign-origin mutations rejected");
  const node = await json("node");
  assert.equal(node.ready, true);
  assert.equal(node.mode, "light");
  checks.push("Hosted app reads the actual local Bee light node");
  const draft = await json("drafts", "POST", {
    title: `Hosting verification ${randomUUID()}`,
    description: "Temporary generated upload fixture. Not published.",
  });
  draftId = draft.id;
  const bytes = Buffer.alloc(5 * 1024 * 1024 + 19, 31);
  bytes[bytes.length - 1] = 7;
  const transfer = await json(`drafts/${draft.id}/uploads`, "POST", {
    name: "Vercel 5 MiB verification.bin",
    type: "application/octet-stream",
    size: bytes.length,
    sha256: sha(bytes),
  });
  const paths = [];
  for (const part of [0, 1, 1, 2]) {
    const body = bytes.subarray(
      part * transfer.chunkBytes,
      (part + 1) * transfer.chunkBytes,
    );
    const r = await request(
      `drafts/${draft.id}/uploads/${transfer.id}/${part}`,
      "PUT",
      body,
    );
    if (!r.ok) throw new Error(`Part ${part}: ${r.status} ${await r.text()}`);
    paths.push(body.length);
  }
  let completed = await json(
    `drafts/${draft.id}/uploads/${transfer.id}/complete`,
    "POST",
  );
  assert.equal(completed.files.length, 1);
  completed = await json(
    `drafts/${draft.id}/uploads/${transfer.id}/complete`,
    "POST",
  );
  assert.equal(completed.files.length, 1);
  const file = completed.files[0],
    parts = [];
  for (let part = 0; part < 3; part++) {
    const r = await request(`drafts/${draft.id}/files/${file.id}?part=${part}`);
    assert.equal(r.status, 200);
    parts.push(Buffer.from(await r.arrayBuffer()));
  }
  assert.equal(sha(Buffer.concat(parts)), sha(bytes));
  checks.push(
    "5 MiB file uploaded and downloaded through Vercel in 2 MiB parts",
  );
  checks.push(
    "Retried part and repeated completion did not duplicate the file",
  );
  await json(`drafts/${draft.id}/files/${file.id}`, "DELETE");
  // Remove only this script-created unpublished draft on the local keeper.
  await rm(path.join(".runtime", "folio", "drafts", draft.id), {
    recursive: true,
    force: true,
  });
  draftId = undefined;
  const logout = await request("auth", "DELETE");
  assert.equal(logout.status, 200);
  assert.ok(logout.headers.get("set-cookie")?.includes("Max-Age=0"));
  checks.push("Logout clears the browser cookie");
  const report = {
    kind: "deployed-api-integration",
    observedAt: new Date().toISOString(),
    origin,
    checks,
    uploadedBytes: bytes.length,
    largestRequestBytes: Math.max(...paths),
    uploadSha256: sha(bytes),
    node: {
      mode: node.mode,
      version: node.version,
      peers: node.peers,
      ready: node.ready,
    },
    complete: true,
  };
  await mkdir("evidence/hosting", { recursive: true });
  await writeFile(
    "evidence/hosting/vercel-integration.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (draftId)
    await rm(path.join(".runtime", "folio", "drafts", draftId), {
      recursive: true,
      force: true,
    });
}
