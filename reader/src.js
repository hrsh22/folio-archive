import { zipSync, strToU8 } from "fflate";
import { Bee } from "@ethersphere/bee-js";
const $ = (id) => document.getElementById(id);
let opened;
const hex = /^[a-f0-9]{64}$/i;
const status = (message, error = false) => {
  $("status").textContent = message;
  $("status").classList.toggle("error", error);
};
function reference(value) {
  if (hex.test(value.trim())) return value.trim().toLowerCase();
  const u = new URL(value);
  const match = u.pathname.match(/\/bzz\/([a-f0-9]{64})(?:\/|$)/i);
  const ref = match?.[1] || u.searchParams.get("archive") || u.hash.slice(1);
  if (!hex.test(ref || ""))
    throw Error("This link does not contain a valid archive reference.");
  return ref.toLowerCase();
}
function endpoint(value) {
  const u = new URL(value);
  if (
    !["http:", "https:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    u.search ||
    u.hash
  )
    throw Error("Use an HTTP(S) endpoint without embedded credentials.");
  return u.href.replace(/\/$/, "");
}
async function get(url) {
  const r = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok)
    throw Error(
      `Retrieval failed (HTTP ${r.status}). Check the endpoint, archive address and storage lifetime.`,
    );
  return r;
}
const fileUrl = (root, snapshot, path) =>
  `${root}/bzz/${snapshot}/${path.split("/").map(encodeURIComponent).join("/")}`;
function validPath(path) {
  return (
    typeof path === "string" &&
    path.length < 241 &&
    path.startsWith("files/") &&
    !/[\\\x00-\x1f\x7f:]/.test(path) &&
    path.split("/").every((p) => p && p !== "." && p !== "..")
  );
}
function inventory(value) {
  if (
    value.format !== "folio.archive" ||
    value.version !== 1 ||
    !Array.isArray(value.files) ||
    !value.files.length ||
    value.files.length > 200
  )
    throw Error("Unsupported or invalid archive format.");
  let total = 0;
  const seen = new Set();
  for (const f of value.files) {
    if (
      !validPath(f.path) ||
      typeof f.name !== "string" ||
      !Number.isSafeInteger(f.size) ||
      f.size < 0 ||
      f.size > 25 * 1024 * 1024 ||
      !hex.test(f.sha256) ||
      seen.has(f.path.toLowerCase())
    )
      throw Error("The archive contains an invalid file entry.");
    seen.add(f.path.toLowerCase());
    total += f.size;
  }
  if (total > 100 * 1024 * 1024)
    throw Error("This reader supports collections up to 100 MB.");
  return value;
}
async function verify(file, context = opened) {
  const r = await get(fileUrl(context.root, context.snapshot, file.path));
  const reader = r.body.getReader(),
    parts = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > file.size) throw Error(`Size mismatch for ${file.name}.`);
      parts.push(part.value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  const digest = [
    ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  ]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
  if (bytes.length !== file.size || digest !== file.sha256)
    throw Error(`Integrity verification failed for ${file.name}.`);
  return bytes;
}
function save(bytes, name, type = "application/octet-stream") {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
async function openArchive(value) {
  $("open").disabled = true;
  $("archive").hidden = true;
  status("Resolving the archive from Swarm…");
  try {
    const ref = reference(value),
      root = endpoint($("endpoint").value);
    const descriptor = await (
      await get(fileUrl(root, ref, "bootstrap.json"))
    ).json();
    if (
      descriptor.format !== "folio.archive-address" ||
      descriptor.version !== 1 ||
      descriptor.manifestReference !== ref ||
      !hex.test(descriptor.topic) ||
      !/^(0x)?[a-f0-9]{40}$/i.test(descriptor.owner)
    )
      throw Error("Invalid archive address metadata.");
    // Bee 2.8's feed route is binary. Use the pinned SDK's reference decoder,
    // including its network lookup, rather than assuming a JSON response.
    const update = await new Bee(root, { timeout: 45000 }).feed
      .makeReader(descriptor.topic, descriptor.owner)
      .downloadReference();
    const feed = { reference: update.reference.toHex() };
    if (!hex.test(feed.reference))
      throw Error("The feed did not return a collection reference.");
    const archive = inventory(
      await (await get(fileUrl(root, feed.reference, "archive.json"))).json(),
    );
    if (archive.archiveId !== descriptor.archiveId)
      throw Error("Archive identity mismatch.");
    opened = { root, snapshot: feed.reference, archive, descriptor };
    $("title").textContent = archive.title;
    $("description").textContent = archive.description;
    $("count").textContent =
      `${archive.files.length} FILES · PUBLISHED ${new Date(archive.publishedAt).toLocaleDateString()}`;
    $("storage").textContent =
      `Storage observation: approximately ${(archive.storage.remainingSeconds / 86400).toFixed(1)} days remained when checked on ${new Date(archive.storage.observedAt).toLocaleString()}. This is a historical estimate, not a current guarantee.`;
    $("technical").textContent = JSON.stringify(
      {
        descriptor,
        snapshot: feed.reference,
        publishedAt: archive.publishedAt,
      },
      null,
      2,
    );
    $("files").replaceChildren();
    for (const file of archive.files) {
      const card = document.createElement("article");
      card.className = "file";
      if (/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type)) {
        const img = document.createElement("img");
        img.src = fileUrl(root, feed.reference, file.path);
        img.alt = file.name;
        img.loading = "lazy";
        card.append(img);
      } else {
        const icon = document.createElement("div");
        icon.className = "placeholder";
        icon.textContent = "Aa";
        card.append(icon);
      }
      const info = document.createElement("div");
      info.className = "info";
      const h = document.createElement("h3");
      h.textContent = file.name;
      const meta = document.createElement("p");
      meta.textContent = `${(file.size / 1024).toFixed(1)} KB · ${file.type}`;
      const button = document.createElement("button");
      button.textContent = "Verify & download ↓";
      button.onclick = async () => {
        button.disabled = true;
        try {
          save(await verify(file), file.name, file.type);
          status(`${file.name}: checksum verified.`);
        } catch (e) {
          status(e.message, true);
        } finally {
          button.disabled = false;
        }
      };
      info.append(h, meta, button);
      card.append(info);
      $("files").append(card);
    }
    $("archive").hidden = false;
    status(
      "Archive retrieved from Swarm. Downloads are verified against the published checksums.",
    );
  } catch (e) {
    opened = undefined;
    status(e.message, true);
  } finally {
    $("open").disabled = false;
  }
}
$("open-form").onsubmit = (e) => {
  e.preventDefault();
  openArchive($("address").value);
};
$("recover").onclick = async () => {
  if (!opened) return;
  $("recover").disabled = true;
  $("open").disabled = true;
  const context = opened;
  try {
    const zip = {},
      results = [];
    for (const [i, file] of context.archive.files.entries()) {
      status(
        `Recovering and verifying ${i + 1} of ${context.archive.files.length}: ${file.name}`,
      );
      zip[file.path] = await verify(file, context);
      results.push({ path: file.path, sha256: file.sha256, verified: true });
    }
    zip["archive.json"] = strToU8(JSON.stringify(context.archive, null, 2));
    zip["bootstrap.json"] = strToU8(
      JSON.stringify(context.descriptor, null, 2),
    );
    zip["recovery-report.json"] = strToU8(
      JSON.stringify(
        {
          observedAt: new Date().toISOString(),
          snapshot: context.snapshot,
          endpoint: context.root,
          files: results,
          complete: true,
        },
        null,
        2,
      ),
    );
    save(
      zipSync(zip, { level: 0 }),
      "folio-recovered-archive.zip",
      "application/zip",
    );
    status(
      `All ${results.length} files recovered and verified. Your ZIP includes the inventory and verification report.`,
    );
  } catch (e) {
    status(
      `Recovery incomplete: ${e.message} No complete archive was issued.`,
      true,
    );
  } finally {
    $("recover").disabled = false;
    $("open").disabled = false;
  }
};
const params = new URLSearchParams(location.search);
if (params.get("endpoint")) $("endpoint").value = params.get("endpoint");
if (params.get("archive")) {
  $("address").value = params.get("archive");
  openArchive(params.get("archive"));
} else if (location.pathname.includes("/bzz/")) {
  const match = location.pathname.match(/\/bzz\/([a-f0-9]{64})/i);
  if (match) {
    $("address").value = match[1];
    openArchive(match[1]);
  }
}
