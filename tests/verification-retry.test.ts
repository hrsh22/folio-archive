import { test } from "node:test";
import assert from "node:assert/strict";
import { BeeResponseError } from "@ethersphere/bee-js";
import { retryNetworkVerification } from "../src/lib/server/verification-retry";

const httpError = (status?: number) =>
  new BeeResponseError(
    "GET",
    "https://gateway.example/bzz/snapshot/archive.json",
    "Network read failed",
    undefined,
    status,
  );

test("snapshot verification survives more than four propagation failures and retains one snapshot", async () => {
  let calls = 0;
  let retries = 0;
  const snapshot = "one-immutable-snapshot";
  const result = await retryNetworkVerification(
    async (signal) => {
      assert.equal(signal.aborted, false);
      calls++;
      if (calls <= 5) throw httpError(404);
      return snapshot;
    },
    () => retries++,
    { timeoutMs: 1000, retryDelayMs: 1 },
  );
  assert.equal(result, snapshot);
  assert.equal(calls, 6);
  assert.equal(retries, 5);
});

test("invalid inventory, checksum mismatches and permanent HTTP errors fail without retrying", async () => {
  for (const failure of [
    new SyntaxError("Invalid JSON"),
    new Error("Checksum mismatch"),
    httpError(400),
    httpError(403),
  ]) {
    let calls = 0;
    await assert.rejects(
      retryNetworkVerification(
        async () => {
          calls++;
          throw failure;
        },
        () => assert.fail("must not retry"),
      ),
      (error) => error === failure,
    );
    assert.equal(calls, 1);
  }
});

test("transport failures and temporary gateway errors are retried", async () => {
  for (const status of [undefined, 408, 429, 502]) {
    let calls = 0;
    const result = await retryNetworkVerification(
      async () => {
        if (++calls === 1) throw httpError(status);
        return "verified";
      },
      () => {},
      { timeoutMs: 1000, retryDelayMs: 1 },
    );
    assert.equal(result, "verified");
    assert.equal(calls, 2);
  }
});

test("the verification deadline aborts a pending request and does not start another attempt", async () => {
  let calls = 0;
  let aborted = false;
  await assert.rejects(
    retryNetworkVerification(
      (signal) =>
        new Promise((_, reject) => {
          calls++;
          signal.addEventListener(
            "abort",
            () => {
              aborted = true;
              reject(httpError());
            },
            { once: true },
          );
        }),
      () => assert.fail("must not retry after deadline"),
      { timeoutMs: 25, retryDelayMs: 1 },
    ),
    /public gateway did not verify/,
  );
  assert.equal(aborted, true);
  assert.equal(calls, 1);
});
