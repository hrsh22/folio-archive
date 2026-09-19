import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

// Each node:test file runs in its own process. All fixtures stay in this repo.
const original = process.cwd();
await mkdir(path.join(original, ".runtime", "tests"), { recursive: true });
const root = await mkdtemp(
  path.join(original, ".runtime", "tests", "uploads-"),
);
process.chdir(root);
const { createDraft, getDraft, hash, draftFolder, RUNTIME } =
  await import("../src/lib/server/runtime");
const { beginUpload, putUploadPart, finishUpload, cancelUpload } =
  await import("../src/lib/server/uploads");
const { CHUNK_BYTES } = await import("../src/lib/server/access");
const req = (bytes: Uint8Array) =>
  new Request("http://localhost/api/upload", {
    method: "PUT",
    body: new Uint8Array(bytes),
  });

test("a file larger than Vercel's payload limit survives reordered parts, retries, and idempotent completion", async () => {
  try {
    const draft = await createDraft("Chunk recovery", "test-only draft");
    const bytes = new Uint8Array(5 * 1024 * 1024 + 19);
    bytes.fill(31);
    bytes[bytes.length - 1] = 7;
    const upload = await beginUpload(draft.id, {
      name: "large original \u2014 test.bin",
      type: "application/octet-stream",
      size: bytes.length,
      sha256: hash(bytes),
    });
    for (const part of [2, 0, 1, 1])
      await putUploadPart(
        draft.id,
        upload.id,
        String(part),
        req(bytes.slice(part * CHUNK_BYTES, (part + 1) * CHUNK_BYTES)),
      );
    const other = await createDraft("Other", "");
    await assert.rejects(
      putUploadPart(other.id, upload.id, "0", req(bytes.slice(0, CHUNK_BYTES))),
      /another collection/,
    );
    await assert.rejects(
      putUploadPart(draft.id, upload.id, "0", req(new Uint8Array(CHUNK_BYTES))),
      /different bytes/,
    );
    const result = await finishUpload(draft.id, upload.id);
    assert.equal(result.files.length, 1);
    assert.equal(result.files[0].sha256, hash(bytes));
    assert.equal(
      hash(
        await readFile(path.join(draftFolder(draft.id), result.files[0].path)),
      ),
      hash(bytes),
    );
    assert.equal((await finishUpload(draft.id, upload.id)).files.length, 1);
    assert.equal((await getDraft(draft.id)).files.length, 1);
    const bad = await beginUpload(draft.id, {
      name: "bad.txt",
      type: "text/plain",
      size: 2,
      sha256: hash(new Uint8Array([1, 2])),
    });
    await putUploadPart(draft.id, bad.id, "0", req(new Uint8Array([2, 1])));
    await assert.rejects(finishUpload(draft.id, bad.id), /checksum mismatch/);
    assert.equal((await getDraft(draft.id)).files.length, 1);
    await cancelUpload(draft.id, bad.id);
    const zero = await beginUpload(draft.id, {
      name: "empty.txt",
      type: "text/plain",
      size: 0,
      sha256: hash(new Uint8Array()),
    });
    await putUploadPart(draft.id, zero.id, "0", req(new Uint8Array()));
    assert.equal((await finishUpload(draft.id, zero.id)).files[1].size, 0);
  } finally {
    process.chdir(original);
    await rm(root, { recursive: true, force: true });
  }
});
