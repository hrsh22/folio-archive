import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const COOKIE = "folio_keeper";
export const CLOUD = () =>
  Boolean(process.env.VERCEL || process.env.FOLIO_KEEPER_URL);
export function equalSecret(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function bridgeAuthenticated(request: Request) {
  const key = process.env.FOLIO_BRIDGE_KEY || "";
  return (
    key.length >= 32 &&
    equalSecret(request.headers.get("authorization") || "", `Bearer ${key}`)
  );
}
function ownerKey() {
  const key = process.env.FOLIO_OWNER_KEY || "";
  if (key.length < 32)
    throw new Error("Keeper access has not been configured.");
  return key;
}
function sign(value: string) {
  return createHmac("sha256", ownerKey()).update(value).digest("hex");
}
export function createSession(now = Date.now()) {
  const value = `${now + 8 * 60 * 60 * 1000}.${randomBytes(24).toString("hex")}`;
  return `${value}.${sign(value)}`;
}
export function readSession(request: Request, now = Date.now()) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (!token || token.length > 200) return null;
  const [expires, nonce, signature, extra] = token.split(".");
  if (
    extra ||
    !/^\d{13}$/.test(expires) ||
    !/^[a-f0-9]{48}$/.test(nonce || "") ||
    !signature ||
    Number(expires) <= now ||
    Number(expires) > now + 8 * 60 * 60 * 1000
  )
    return null;
  return equalSecret(signature, sign(`${expires}.${nonce}`)) ? token : null;
}
export function csrfToken(session: string) {
  return sign(`csrf:${session}`);
}
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  // Host comes from the platform, never from a client-provided redirect URL.
  if (
    !origin ||
    new URL(origin).host !== (request.headers.get("host") || url.host) ||
    new URL(origin).protocol !== url.protocol ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    throw new Error("Cross-origin access is not permitted.");
  }
}
export function assertOwner(request: Request, mutation = false) {
  const session = readSession(request);
  if (!session) throw new Error("Sign in to the keeper workspace.");
  if (mutation) {
    assertSameOrigin(request);
    if (
      !equalSecret(
        request.headers.get("x-folio-session") || "",
        csrfToken(session),
      )
    )
      throw new Error("Refresh the workspace before trying again.");
  }
  return session;
}
export function checkOwnerKey(candidate: string) {
  return equalSecret(candidate, ownerKey());
}
export const CHUNK_BYTES = 2 * 1024 * 1024;
export async function limitedBody(
  request: Request,
  limit = CHUNK_BYTES + 16384,
) {
  if (Number(request.headers.get("content-length")) > limit)
    throw new Error("Request too large. Upload files in 2 MB parts.");
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const pieces: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit)
        throw new Error("Request too large. Upload files in 2 MB parts.");
      pieces.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of pieces) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
