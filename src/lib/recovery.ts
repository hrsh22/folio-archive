import { createHash } from "node:crypto";
import { resolveArchive } from "./network";
import type { ArchiveFile } from "./archive-format";

// This module has no publisher, disk catalogue, wallet, or private-key dependency.
export async function downloadVerified(
  endpoint: string,
  snapshot: string,
  file: ArchiveFile,
) {
  const url = `${endpoint.replace(/\/$/, "")}/bzz/${snapshot}/${file.path.split("/").map(encodeURIComponent).join("/")}`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(60000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(
      `Retrieval failed for ${file.name} (HTTP ${response.status}).`,
    );
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The endpoint returned an empty response body.");
  const pieces: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > file.size) throw new Error(`Size mismatch for ${file.name}.`);
      pieces.push(next.value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = Buffer.concat(pieces);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (size !== file.size || sha256 !== file.sha256)
    throw new Error(`Checksum or size mismatch for ${file.name}.`);
  return bytes;
}

export async function recoverArchive(
  input: string,
  endpoint: string,
  accept?: (file: ArchiveFile, bytes: Buffer) => Promise<void>,
) {
  // Resolve once, then read every file from that immutable snapshot. A feed update
  // during recovery cannot mix versions inside the resulting collection.
  const { archive, descriptor, snapshot, feedIndex } = await resolveArchive(
    input,
    endpoint,
  );
  const files = [];
  for (const file of archive.files) {
    const bytes = await downloadVerified(endpoint, snapshot, file);
    if (accept) await accept(file, bytes);
    files.push({
      path: file.path,
      name: file.name,
      bytes: bytes.length,
      sha256: file.sha256,
      verified: true,
    });
  }
  return {
    archive,
    descriptor,
    report: {
      kind: "independent-recovery",
      observedAt: new Date().toISOString(),
      endpoint: new URL(endpoint).origin,
      snapshot,
      feedIndex,
      files,
      complete: true,
    },
  };
}
