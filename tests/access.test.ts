import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  COOKIE,
  assertOwner,
  bridgeAuthenticated,
  createSession,
  csrfToken,
  readSession,
  limitedBody,
  CHUNK_BYTES,
} from "../src/lib/server/access";
process.env.FOLIO_OWNER_KEY = randomBytes(32).toString("hex");
process.env.FOLIO_BRIDGE_KEY = randomBytes(32).toString("hex");
const request = (token: string, extra: Record<string, string> = {}) =>
  new Request("https://folio.example/api/drafts", {
    headers: { cookie: `${COOKIE}=${token}`, host: "folio.example", ...extra },
  });
test("keeper sessions reject tampering, expiry, missing cookies and cross-origin mutations", () => {
  const now = Date.now(),
    session = createSession(now);
  assert.equal(readSession(request(session), now), session);
  assert.equal(readSession(request(session), now + 8 * 60 * 60 * 1000), null);
  assert.equal(
    readSession(request(session.replace(/.$/, (c) => (c === "a" ? "b" : "a")))),
    null,
  );
  assert.equal(readSession(new Request("https://folio.example")), null);
  assert.throws(() => assertOwner(request(session), true));
  assert.throws(() =>
    assertOwner(
      request(session, {
        origin: "https://evil.example",
        "x-folio-session": csrfToken(session),
      }),
      true,
    ),
  );
  assert.throws(() =>
    assertOwner(
      request(session, {
        origin: "https://folio.example",
        "x-folio-session": "wrong",
      }),
      true,
    ),
  );
  assert.doesNotThrow(() =>
    assertOwner(
      request(session, {
        origin: "https://folio.example",
        "x-folio-session": csrfToken(session),
      }),
      true,
    ),
  );
});
test("bridge access requires the server secret; cookies and keeper login keys do not grant bridge access", () => {
  assert.equal(
    bridgeAuthenticated(new Request("https://keeper.example")),
    false,
  );
  assert.equal(
    bridgeAuthenticated(
      new Request("https://keeper.example", {
        headers: { authorization: `Bearer ${process.env.FOLIO_OWNER_KEY}` },
      }),
    ),
    false,
  );
  assert.equal(
    bridgeAuthenticated(
      new Request("https://keeper.example", {
        headers: { authorization: `Bearer ${process.env.FOLIO_BRIDGE_KEY}` },
      }),
    ),
    true,
  );
});
test("upload body limits apply even when Content-Length is absent or misleading", async () => {
  const req = new Request("https://folio.example", {
    method: "PUT",
    body: new Uint8Array(CHUNK_BYTES + 1),
  });
  await assert.rejects(limitedBody(req, CHUNK_BYTES), /too large/);
  assert.equal(
    (
      await limitedBody(
        new Request("https://folio.example", { method: "PUT", body: "hello" }),
      )
    ).length,
    5,
  );
});

test("public preservation status excludes wallet and all keeper credentials", async () => {
  const { publicPreservationStatus } =
    await import("../src/lib/preservation-status");
  const publicStatus = publicPreservationStatus(
    {
      online: true,
      ready: true,
      mode: "light",
      version: "2.8.2",
      wallet: "private-wallet-metadata",
      peers: 138,
      compatible: true,
      batches: [],
      observedAt: new Date().toISOString(),
      message: "internal endpoint details",
    },
    "aa".repeat(32),
  );
  assert.deepEqual(
    Object.keys(publicStatus).sort(),
    [
      "mode",
      "observedAt",
      "online",
      "peers",
      "ready",
      "remainingSeconds",
      "version",
    ].sort(),
  );
  assert.equal(JSON.stringify(publicStatus).includes("private-wallet"), false);
  assert.equal(
    JSON.stringify(publicStatus).includes("internal endpoint"),
    false,
  );
});

test("the hosted proxy returns a payload error before contacting the keeper for an oversized request", async () => {
  const previous = process.env.FOLIO_KEEPER_URL;
  process.env.FOLIO_KEEPER_URL = "https://keeper.example";
  try {
    const { PUT } = await import("../src/app/api/[...path]/route");
    const session = createSession();
    const response = await PUT(
      new Request("https://folio.example/api/drafts/test/uploads", {
        method: "PUT",
        headers: {
          host: "folio.example",
          origin: "https://folio.example",
          cookie: `${COOKIE}=${session}`,
          "x-folio-session": csrfToken(session),
        },
        body: new Uint8Array(CHUNK_BYTES + 16385),
      }),
      { params: Promise.resolve({ path: ["drafts", "test", "uploads"] }) },
    );
    assert.equal(response.status, 413);
    assert.match((await response.json()).error, /too large/);
  } finally {
    if (previous === undefined) delete process.env.FOLIO_KEEPER_URL;
    else process.env.FOLIO_KEEPER_URL = previous;
  }
});
