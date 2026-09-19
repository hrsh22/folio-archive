import { FeedIndex, type FeedWriter } from "@ethersphere/bee-js";
import { isMissingFeed } from "../network";

// The index is always read from Swarm, including after a restart or a retry.
export async function appendReference(
  writer: FeedWriter,
  batchId: string,
  reference: string,
  expectedPrevious: string | null,
) {
  let index: FeedIndex;
  try {
    const current = await writer.downloadReference();
    if (current.reference.toHex() === reference)
      return current.feedIndex.toHex();
    if (current.reference.toHex() !== expectedPrevious)
      throw new Error(
        "The archive changed while publishing. Refresh it before trying again.",
      );
    if (!current.feedIndexNext)
      throw new Error(
        "Bee did not return the next feed index. Retry when the node is synchronised.",
      );
    index = current.feedIndexNext;
  } catch (error) {
    if (!isMissingFeed(error) || expectedPrevious !== null) throw error;
    index = FeedIndex.fromBigInt(0n);
  }
  try {
    await writer.uploadReference(batchId, reference, { index });
  } catch (error) {
    // A timeout may follow a successful network write. Verify before reporting failure.
    try {
      const current = await writer.downloadReference();
      if (current.reference.toHex() === reference)
        return current.feedIndex.toHex();
    } catch {}
    throw error;
  }
  return index.toHex();
}
