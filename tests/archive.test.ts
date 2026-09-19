import { test } from "node:test";
import assert from "node:assert/strict";
import {
  safePath,
  referenceFromInput,
  archiveSchema,
} from "../src/lib/archive-format";
import { assertLocal, state } from "../src/lib/server/runtime";

test("archive paths reject traversal, absolute paths and cross-platform separators", () => {
  for (const p of [
    "../key",
    "/etc/passwd",
    "files/../key",
    "C:/key",
    "files\\key",
    "files//x",
    "files/\u0000x",
    "files/./x",
  ])
    assert.throws(() => safePath(p));
  assert.equal(
    safePath("files/folio \u2014 01.svg"),
    "files/folio \u2014 01.svg",
  );
});
test("public address parser accepts stable links and rejects nonreferences", () => {
  const ref = "ab".repeat(32);
  assert.equal(referenceFromInput(`https://example.org/bzz/${ref}/`), ref);
  assert.equal(
    referenceFromInput(`https://folio-archive.vercel.app/archive/${ref}`),
    ref,
  );
  assert.equal(
    referenceFromInput(`http://127.0.0.1:3001/?archive=${ref}`),
    ref,
  );
  assert.throws(() => referenceFromInput("https://example.org/no-archive"));
});
test("inventory rejects duplicate paths, duplicate IDs and oversized recovery", () => {
  const file = {
    id: "one",
    path: "files/a.txt",
    name: "a.txt",
    type: "text/plain",
    size: 1,
    sha256: "aa".repeat(32),
  };
  const base = {
    format: "folio.archive",
    version: 1,
    archiveId: "b1e3198a-578b-4a1d-9d7d-885204695d7f",
    title: "Study",
    description: "",
    publishedAt: new Date().toISOString(),
    previousSnapshot: null,
    storage: {
      batchId: "bb".repeat(32),
      observedAt: new Date().toISOString(),
      remainingSeconds: 40,
    },
    files: [file],
  };
  assert.equal(archiveSchema.safeParse(base).success, true);
  assert.equal(
    archiveSchema.safeParse({
      ...base,
      files: [file, { ...file, id: "two", path: "files/A.txt" }],
    }).success,
    false,
  );
  assert.equal(
    archiveSchema.safeParse({
      ...base,
      files: [file, { ...file, path: "files/b.txt" }],
    }).success,
    false,
  );
  assert.equal(
    archiveSchema.safeParse({
      ...base,
      files: Array.from({ length: 5 }, (_, i) => ({
        ...file,
        id: String(i),
        path: `files/${i}`,
        size: 25 * 1024 * 1024,
      })),
    }).success,
    false,
  );
});
test("publisher rejects remote origins and missing session tokens, accepts Next loopback aliases", () => {
  const req = (origin: string, token?: string) =>
    new Request("http://localhost:3000/api/drafts", {
      headers: { origin, ...(token ? { "x-folio-session": token } : {}) },
    });
  assert.doesNotThrow(() =>
    assertLocal(req("http://127.0.0.1:3000", state.token), true),
  );
  assert.throws(() =>
    assertLocal(req("https://evil.example", state.token), true),
  );
  assert.throws(() =>
    assertLocal(req("http://localhost:9999", state.token), true),
  );
  assert.throws(() => assertLocal(req("http://localhost:3000"), true));
  assert.throws(() =>
    assertLocal(
      new Request("http://localhost:3000/api/state", {
        headers: { host: "evil.example" },
      }),
    ),
  );
});
