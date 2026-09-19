import { zip } from "fflate";
import { displayText } from "./display-text";
import type { ArchiveFile, Descriptor } from "./archive-format";
import type { resolveArchive } from "./network";

export async function sha256(bytes: Uint8Array) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export async function verifiedBytes(
  endpoint: string,
  snapshot: string,
  file: ArchiveFile,
  signal?: AbortSignal,
) {
  const url = `${endpoint.replace(/\/$/, "")}/bzz/${snapshot}/${file.path.split("/").map(encodeURIComponent).join("/")}`;
  const response = await fetch(url, {
    cache: "no-store",
    signal: signal || AbortSignal.timeout(60000),
  });
  if (!response.ok || !response.body)
    throw new Error(
      `Could not retrieve ${file.name} (HTTP ${response.status}).`,
    );
  const reader = response.body.getReader();
  const pieces: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > file.size) throw new Error(`Size mismatch for ${file.name}.`);
      pieces.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of pieces) {
    bytes.set(part, offset);
    offset += part.length;
  }
  if (size !== file.size || (await sha256(bytes)) !== file.sha256)
    throw new Error(
      `Checksum mismatch for ${file.name}. Recovery stopped; no complete archive was produced.`,
    );
  return bytes;
}
export function zipFiles(files: Record<string, Uint8Array>) {
  return new Promise<Uint8Array>((resolve, reject) =>
    zip(files, { level: 1 }, (error, data) =>
      error ? reject(error) : resolve(data),
    ),
  );
}
export function download(
  bytes: Uint8Array,
  name: string,
  type = "application/octet-stream",
) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = displayText(name);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
const encode = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value, null, 2) + "\n");
export async function recoveryZip(
  resolved: Awaited<ReturnType<typeof resolveArchive>>,
  endpoint: string,
  progress: (done: number, total: number) => void,
  signal?: AbortSignal,
) {
  // The resolved snapshot is captured once; a feed change cannot mix editions.
  const { archive, descriptor, snapshot, feedIndex } = resolved;
  const files: Record<string, Uint8Array> = {
    "archive.json": encode(archive),
    "bootstrap.json": encode(descriptor),
  };
  const verified = [];
  for (const file of archive.files) {
    files[file.path] = await verifiedBytes(endpoint, snapshot, file, signal);
    verified.push({
      path: file.path,
      name: file.name,
      bytes: file.size,
      sha256: file.sha256,
      verified: true,
    });
    progress(verified.length, archive.files.length);
  }
  const report = {
    kind: "browser-independent-recovery",
    observedAt: new Date().toISOString(),
    endpoint: new URL(endpoint).origin,
    snapshot,
    feedIndex,
    files: verified,
    complete: true,
  };
  files["recovery-report.json"] = encode(report);
  files["READ-ME.txt"] = new TextEncoder().encode(
    "Folio verified recovery\n\nEvery file was fetched from one immutable Swarm snapshot and checked against its size and SHA-256 checksum. archive.json maps the storage paths in files/ to their original names and descriptions. bootstrap.json holds the public feed address for future editions. No private keys are included.\n",
  );
  return { bytes: await zipFiles(files), report };
}
export async function handoffZip(descriptor: Descriptor, endpoint: string) {
  const files: Record<string, Uint8Array> = {
    "bootstrap.json": encode(descriptor),
  };
  for (const name of ["index.html", "style.css", "app.js"]) {
    const r = await fetch(`/reader/${name}`);
    if (!r.ok) throw new Error("Could not package the independent reader.");
    files[name] = new Uint8Array(await r.arrayBuffer());
  }
  files["READ-ME.txt"] = new TextEncoder().encode(
    `FOLIO - PUBLIC RECOVERY CARD\n\nStable manifest: ${descriptor.manifestReference}\nOwner: ${descriptor.owner}\nTopic: ${descriptor.topic}\nPublic Bee endpoint: ${endpoint}\n\nThese are public identifiers, not signing keys. Keep this folder somewhere separate from the publisher.\n\nTo recover without the Folio website:\n1. Extract this ZIP.\n2. Serve this folder with any static HTTP server (for example python3 -m http.server 8080).\n3. Open http://localhost:8080 and paste the stable manifest above.\n4. Download the verified archive. The reader discovers its inventory from Swarm.\n\nThe contents remain available only while their postage is funded and the network can retrieve them. Keep an independently verified local copy as well. This recovery kit grants read access; it does not grant the ability to publish new editions.\n`,
  );
  return zipFiles(files);
}
