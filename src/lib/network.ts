import { Bee, BeeResponseError } from "@ethersphere/bee-js";
import {
  archiveSchema,
  descriptorSchema,
  referenceFromInput,
  type Descriptor,
} from "./archive-format";

export function isMissingFeed(error: unknown): boolean {
  return error instanceof BeeResponseError && error.status === 404;
}
export function makeBee(endpoint: string) {
  const url = new URL(endpoint);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Use an HTTP(S) Bee endpoint without credentials or query parameters.",
    );
  return new Bee(url.href.replace(/\/$/, ""), { timeout: 45_000 });
}
export async function readSnapshot(bee: Bee, descriptor: Descriptor) {
  const d = descriptorSchema.parse(descriptor);
  const latest = await bee.feed
    .makeReader(d.topic, d.owner)
    .downloadReference();
  const snapshot = latest.reference.toHex();
  const result = await bee.file.download(snapshot, "archive.json");
  if (result.data.length > 1024 * 1024)
    throw new Error("Archive inventory is too large.");
  const archive = archiveSchema.parse(result.data.toJSON());
  if (archive.archiveId !== d.archiveId)
    throw new Error("Archive identity does not match its public address.");
  return {
    archive,
    snapshot,
    feedIndex: latest.feedIndex.toHex(),
    nextIndex: latest.feedIndexNext,
  };
}
export async function resolveArchive(input: string, endpoint: string) {
  const reference = referenceFromInput(input);
  const bee = makeBee(endpoint);
  const result = await bee.file.download(reference, "bootstrap.json");
  if (result.data.length > 8192)
    throw new Error("Archive address metadata is too large.");
  const descriptor = descriptorSchema.parse(result.data.toJSON());
  if (descriptor.manifestReference !== reference)
    throw new Error("Archive address does not match its bootstrap metadata.");
  return { descriptor, ...(await readSnapshot(bee, descriptor)) };
}
