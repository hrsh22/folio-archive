import {
  CLOUD,
  COOKIE,
  assertSameOrigin,
  checkOwnerKey,
  createSession,
  readSession,
} from "@/lib/server/access";
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200, cookie?: string) =>
  Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(cookie ? { "Set-Cookie": cookie } : {}),
    },
  });
export async function GET(request: Request) {
  try {
    if (!CLOUD()) {
      const { assertLocal } = await import("@/lib/server/runtime");
      assertLocal(request);
    }
    return json({
      authenticated: !CLOUD() || Boolean(readSession(request)),
      local: !CLOUD(),
    });
  } catch {
    return json({ authenticated: false, local: false });
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (Number(request.headers.get("content-length")) > 1024)
      return json({ error: "Invalid access key." }, 400);
    const { key } = await request.json();
    if (typeof key !== "string" || key.length > 256 || !checkOwnerKey(key))
      return json({ error: "That access key did not match." }, 401);
    const token = createSession();
    return json(
      { authenticated: true },
      200,
      `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`,
    );
  } catch {
    return json(
      {
        error:
          "Keeper access is unavailable. Check the deployment configuration.",
      },
      403,
    );
  }
}
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return json({ error: "Cross-origin access is not permitted." }, 403);
  }
  return json(
    { authenticated: false },
    200,
    `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`,
  );
}
