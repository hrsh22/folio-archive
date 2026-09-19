import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BeeResponseError,
  FeedIndex,
  Reference,
  type FeedWriter,
} from "@ethersphere/bee-js";
import { appendReference } from "../src/lib/server/feed-update";

const old = "11".repeat(32),
  next = "22".repeat(32),
  batch = "33".repeat(32);
const current = (reference = old, index = 17n) => ({
  reference: new Reference(reference),
  feedIndex: FeedIndex.fromBigInt(index),
  feedIndexNext: FeedIndex.fromBigInt(index + 1n),
});
test("restarted publisher uses the network's next index, never a local counter", async () => {
  let used = "";
  const writer = {
    downloadReference: async () => current(),
    uploadReference: async (
      _b: string,
      _r: string,
      options: { index: FeedIndex },
    ) => {
      used = options.index.toHex();
    },
  } as unknown as FeedWriter;
  assert.equal(
    await appendReference(writer, batch, next, old),
    FeedIndex.fromBigInt(18n).toHex(),
  );
  assert.equal(used, FeedIndex.fromBigInt(18n).toHex());
});
test("an explicitly missing new feed publishes index zero", async () => {
  const writer = {
    downloadReference: async () => {
      throw new BeeResponseError("GET", "/feeds", "missing", undefined, 404);
    },
    uploadReference: async (
      _b: string,
      _r: string,
      options: { index: FeedIndex },
    ) => {
      assert.equal(options.index.toHex(), FeedIndex.fromBigInt(0n).toHex());
    },
  } as unknown as FeedWriter;
  await appendReference(writer, batch, next, null);
});
test("timeouts and lost old feeds never masquerade as an empty feed", async () => {
  for (const [status, previous] of [
    [503, null],
    [404, old],
  ] as const) {
    let wrote = false;
    const writer = {
      downloadReference: async () => {
        throw new BeeResponseError(
          "GET",
          "/feeds",
          "failure",
          undefined,
          status,
        );
      },
      uploadReference: async () => {
        wrote = true;
      },
    } as unknown as FeedWriter;
    await assert.rejects(appendReference(writer, batch, next, previous));
    assert.equal(wrote, false);
  }
});
test("a concurrent update is rejected, and an already-published reference is idempotent", async () => {
  let writes = 0;
  const writer = {
    downloadReference: async () => current(),
    uploadReference: async () => {
      writes++;
    },
  } as unknown as FeedWriter;
  await assert.rejects(
    appendReference(writer, batch, next, "44".repeat(32)),
    /changed/,
  );
  await appendReference(writer, batch, old, null);
  assert.equal(writes, 0);
});
test("a write timeout is reconciled by reading the reference back from Swarm", async () => {
  let reads = 0;
  const writer = {
    downloadReference: async () =>
      ++reads === 1 ? current() : current(next, 18n),
    uploadReference: async () => {
      throw Error("timeout after send");
    },
  } as unknown as FeedWriter;
  assert.equal(
    await appendReference(writer, batch, next, old),
    FeedIndex.fromBigInt(18n).toHex(),
  );
});
