import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { downloadVerified } from "../src/lib/recovery";

test("recovery checks actual bytes, rejects corruption/truncation/oversize and missing files", async () => {
  const original = Buffer.from("A collection worth keeping. ".repeat(300)); // Multi-chunk (> 4 KB).
  let body = original,
    code = 200;
  const server = createServer((_req, res) => {
    res.writeHead(code);
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as { port: number };
    const endpoint = `http://127.0.0.1:${address.port}`;
    const file = {
      id: "one",
      path: "files/one.txt",
      name: "one.txt",
      type: "text/plain",
      size: original.length,
      sha256: createHash("sha256").update(original).digest("hex"),
      caption: "",
      source: "",
    };
    assert.deepEqual(
      await downloadVerified(endpoint, "ab".repeat(32), file),
      original,
    );
    body = Buffer.alloc(original.length, 1);
    await assert.rejects(
      downloadVerified(endpoint, "ab".repeat(32), file),
      /mismatch/,
    );
    body = original.subarray(0, 10);
    await assert.rejects(
      downloadVerified(endpoint, "ab".repeat(32), file),
      /mismatch/,
    );
    body = Buffer.concat([original, Buffer.from("extra")]);
    await assert.rejects(
      downloadVerified(endpoint, "ab".repeat(32), file),
      /mismatch/,
    );
    code = 404;
    await assert.rejects(
      downloadVerified(endpoint, "ab".repeat(32), file),
      /HTTP 404/,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  }
});
