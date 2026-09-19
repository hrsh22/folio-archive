import { Duration, Size } from "@ethersphere/bee-js";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { makeBee } from "../network";
import { BEE_URL, ROOT, state, writeJson } from "./runtime";
import { nodeStatus } from "./node-status";

export async function quoteStorage(input: {
  action: "buy" | "renew";
  batchId?: string;
  days: number;
  megabytes: number;
}) {
  const status = await nodeStatus();
  if (!status.ready) throw new Error(status.message);
  if (
    input.action === "renew" &&
    !status.batches.some((b) => b.id === input.batchId && b.immutable)
  )
    throw new Error("Select one of this node's immutable batches.");
  const bee = makeBee(BEE_URL);
  const cost =
    input.action === "renew"
      ? await bee.storage.getDurationExtensionCost(
          input.batchId!,
          Duration.fromDays(input.days),
        )
      : await bee.storage.getCost(
          Size.fromMegabytes(input.megabytes),
          Duration.fromDays(input.days),
        );
  const id = randomUUID();
  const expires = Date.now() + 120_000;
  state.quotes.set(id, { ...input, plur: cost.toPLURString(), expires });
  return {
    id,
    ...input,
    bzz: cost.toDecimalString(),
    expiresAt: new Date(expires).toISOString(),
    note: "Storage estimate in xBZZ; Gnosis transaction gas is additional. Lifetime changes with network pricing.",
  };
}
export async function executeStorage(quoteId: string) {
  const quote = state.quotes.get(quoteId);
  if (!quote || quote.expires < Date.now())
    throw new Error("This quote expired. Request a new estimate.");
  state.quotes.delete(quoteId); // Single use, even if a transaction times out.
  const before = await nodeStatus();
  if (!before.ready) throw new Error(before.message);
  const bee = makeBee(BEE_URL);
  const duration = Duration.fromDays(quote.days);
  const cost =
    quote.action === "renew"
      ? await bee.storage.getDurationExtensionCost(quote.batchId!, duration)
      : await bee.storage.getCost(
          Size.fromMegabytes(quote.megabytes),
          duration,
        );
  if (cost.toPLURBigInt() > BigInt(quote.plur))
    throw new Error(
      "The estimated price increased. Request and review a new quote.",
    );
  const result =
    quote.action === "renew"
      ? await bee.storage.extendDuration(quote.batchId!, duration)
      : await bee.storage.buy(Size.fromMegabytes(quote.megabytes), duration, {
          immutableFlag: true,
          label: "Folio archive",
          waitForUsable: true,
        });
  // Both operations return a BatchId in bee-js 13.1.0. This is not a tx hash.
  const batchId = result.toHex();
  let after = await nodeStatus();
  if (quote.action === "renew") {
    const previous = before.batches.find(
      (b) => b.id === batchId,
    )!.remainingSeconds;
    for (
      let attempt = 0;
      attempt < 30 &&
      (after.batches.find((b) => b.id === batchId)?.remainingSeconds || 0) <=
        previous;
      attempt++
    ) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      after = await nodeStatus();
    }
  }
  const receipt = {
    kind: "live-storage-operation",
    action: quote.action,
    observedAt: after.observedAt,
    batchId,
    quotedBzz: cost.toDecimalString(),
    before: before.batches,
    after: after.batches,
  };
  await writeJson(
    path.join(ROOT, "evidence", "storage", `${randomUUID()}.json`),
    receipt,
  );
  return { batchId, node: after };
}
