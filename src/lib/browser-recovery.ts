import { zip } from "fflate";
import { displayText } from "./display-text";
import {
  descriptorSchema,
  type ArchiveFile,
  type Descriptor,
} from "./archive-format";
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
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(60000)])
      : AbortSignal.timeout(60000),
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
  const card = descriptorSchema.parse(descriptor);
  const url = new URL(endpoint);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("Use a public Bee endpoint without credentials.");
  const files: Record<string, Uint8Array> = {
    "bootstrap.json": encode(card),
  };
  const r = await fetch("/reader/standalone.html");
  if (!r.ok) throw new Error("Could not package the independent reader.");
  const template = await r.text();
  const marker =
    /<script id="folio-recovery-config" type="application\/json">\s*null\s*<\/script>/;
  if (!marker.test(template))
    throw new Error("The recovery reader is incomplete. Please retry.");
  const config = JSON.stringify({
    descriptor: card,
    endpoint: url.href.replace(/\/$/, ""),
  })
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
  files["Open Folio.html"] = new TextEncoder().encode(
    template.replace(
      marker,
      () =>
        `<script id="folio-recovery-config" type="application/json">${config}</script>`,
    ),
  );
  files["READ-ME.txt"] = new TextEncoder().encode(
    `FOLIO - YOUR RECOVERY CARD\n\n1. Extract this ZIP.\n2. Double-click Open Folio.html to open it in a current browser, such as Chrome, Edge, or Firefox.\n3. Your collection opens automatically. Choose Recover entire archive to save a verified copy.\n\nNo installation, terminal, account, or local server is needed. An internet connection and a reachable public Bee endpoint are required. If the endpoint is unavailable, expand Choose a retrieval endpoint and enter another public Bee API.\n\nKeep Open Folio.html on a USB drive, another computer, or with someone you trust. It contains its own reader and the public address below. It does not rely on the Folio website. This card is a way to find the collection, not a backup of the collection's files. Download the verified archive as well.\n\nStable manifest: ${card.manifestReference}\nOwner: ${card.owner}\nTopic: ${card.topic}\nPublic Bee endpoint: ${url.href}\n\nStorage still needs funded postage and network availability. Public identifiers grant read access, not permission to publish new editions. No private keys are included.\n\nMOVING INSTITUTIONS OR CHANGING CUSTODIANS\n\nGive the next custodian both this card and a verified archive download. Have them open the card on another computer and recover all files before access to your old account ends. Keep copies in more than one place.\n\nAgree who checks storage and pays for renewal. This card does not renew postage, transfer funds or hand over publishing rights. If future editing is needed, arrange a separate private handover of the keeper signing credentials; never add them to this public card. Without them, existing editions can still be read while available, but a new custodian cannot update this address.\n`,
  );
  return zipFiles(files);
}
