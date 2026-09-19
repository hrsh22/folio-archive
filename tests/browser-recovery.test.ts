import { test } from "node:test";
import assert from "node:assert/strict";
import { unzipSync } from "fflate";
import {
  recoveryZip,
  sha256,
  verifiedBytes,
} from "../src/lib/browser-recovery";
import type { resolveArchive } from "../src/lib/network";
const bytes = new TextEncoder().encode("A keeper’s note\n");
const file = {
  id: "note",
  path: "files/note.txt",
  name: "Keeper’s note.txt",
  type: "text/plain",
  caption: "",
  source: "",
  size: bytes.length,
  sha256: await sha256(bytes),
};
const descriptor = {
  format: "folio.archive-address" as const,
  version: 1 as const,
  archiveId: "a".repeat(36),
  owner: "ab".repeat(20),
  topic: "cd".repeat(32),
  manifestReference: "ef".repeat(32),
};
const resolved = {
  descriptor,
  snapshot: "11".repeat(32),
  feedIndex: "0000000000000002",
  archive: {
    format: "folio.archive",
    version: 1,
    archiveId: descriptor.archiveId,
    title: "Study",
    description: "",
    publishedAt: new Date().toISOString(),
    previousSnapshot: null,
    storage: {
      batchId: "22".repeat(32),
      observedAt: new Date().toISOString(),
      remainingSeconds: 50,
    },
    files: [file],
  },
} as Awaited<ReturnType<typeof resolveArchive>>;
test("browser recovery creates a complete ZIP only after every file verifies from the captured snapshot", async () => {
  const original = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = async (input) => {
    requested.push(String(input));
    return new Response(bytes);
  };
  try {
    const { bytes: zip, report } = await recoveryZip(
      resolved,
      "https://reader.example",
      () => {},
    );
    assert.equal(report.complete, true);
    assert.equal(report.files.length, 1);
    assert.ok(requested.every((url) => url.includes(resolved.snapshot)));
    const files = unzipSync(zip);
    assert.deepEqual(files[file.path], bytes);
    assert.ok(
      files["archive.json"] &&
        files["bootstrap.json"] &&
        files["recovery-report.json"],
    );
    globalThis.fetch = async () => new Response(new Uint8Array(bytes.length));
    await assert.rejects(
      recoveryZip(resolved, "https://reader.example", () => {}),
      /Checksum mismatch/,
    );
    globalThis.fetch = async () =>
      new Response(new Uint8Array(bytes.length + 1));
    await assert.rejects(
      verifiedBytes("https://reader.example", resolved.snapshot, file),
      /Size mismatch/,
    );
    globalThis.fetch = async () => new Response("missing", { status: 404 });
    await assert.rejects(
      recoveryZip(resolved, "https://reader.example", () => {}),
      /HTTP 404/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
