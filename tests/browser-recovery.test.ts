import { test } from "node:test";
import assert from "node:assert/strict";
import { unzipSync } from "fflate";
import { readFile } from "node:fs/promises";
import {
  recoveryZip,
  sha256,
  verifiedBytes,
  handoffZip,
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

test("recovery card is self-contained, keeps its public address, and rejects credential-bearing endpoints", async () => {
  const original = globalThis.fetch;
  const template = await readFile(
    new URL("../public/reader/standalone.html", import.meta.url),
    "utf8",
  );
  const card = {
    ...descriptor,
    archiveId: "77b9a322-61b9-40a1-b7a4-28aa35d6d0fd",
  };
  globalThis.fetch = async () => new Response(template);
  try {
    const files = unzipSync(await handoffZip(card, "https://reader.example"));
    assert.deepEqual(Object.keys(files).sort(), [
      "Open Folio.html",
      "READ-ME.txt",
      "bootstrap.json",
    ]);
    const html = new TextDecoder().decode(files["Open Folio.html"]);
    assert.doesNotMatch(html, /<script\b[^>]*\bsrc\s*=/i);
    assert.doesNotMatch(html, /<link\b[^>]*rel="stylesheet"/i);
    const config = html.match(
      /<script id="folio-recovery-config" type="application\/json">([^]*?)<\/script>/,
    )?.[1];
    assert.ok(config);
    assert.deepEqual(JSON.parse(config), {
      descriptor: card,
      endpoint: "https://reader.example",
    });
    assert.match(
      new TextDecoder().decode(files["READ-ME.txt"]),
      /Double-click Open Folio\.html/,
    );
    const privateEndpoint = new URL("https://reader.example");
    privateEndpoint.username = "fixture-user";
    privateEndpoint.password = "fixture-password";
    await assert.rejects(
      handoffZip(card, privateEndpoint.href),
      /without credentials/,
    );
    globalThis.fetch = async () => new Response("<html>incomplete</html>");
    await assert.rejects(
      handoffZip(card, "https://reader.example"),
      /incomplete/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("cancelable file retrieval retains its timeout and honors user cancellation", async (t) => {
  let deadline = new AbortController();
  const deadlines: number[] = [];
  t.mock.method(AbortSignal, "timeout", (ms: number) => {
    deadlines.push(ms);
    return deadline.signal;
  });
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      const signal = init.signal!;
      return new Promise<Response>((_resolve, reject) => {
        if (signal.aborted) reject(signal.reason);
        else
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
      });
    },
  );
  const caller = new AbortController();
  const request = verifiedBytes(
    "https://reader.example",
    resolved.snapshot,
    file,
    caller.signal,
  );
  void request.catch(() => {});
  try {
    assert.deepEqual(deadlines, [60000]);
    deadline.abort(new DOMException("Timed out", "TimeoutError"));
    await assert.rejects(request, { name: "TimeoutError" });
    assert.equal(caller.signal.aborted, false);

    deadline = new AbortController();
    const cancelled = verifiedBytes(
      "https://reader.example",
      resolved.snapshot,
      file,
      caller.signal,
    );
    caller.abort();
    await assert.rejects(cancelled, { name: "AbortError" });
    assert.equal(deadline.signal.aborted, false);
  } finally {
    caller.abort();
  }
});
