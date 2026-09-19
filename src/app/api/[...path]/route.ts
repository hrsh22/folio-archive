import {
  CLOUD,
  assertOwner,
  bridgeAuthenticated,
  csrfToken,
  limitedBody,
} from "@/lib/server/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
type Context = { params: Promise<{ path: string[] }> };
const json = (value: unknown, status: number) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });

async function handle(request: Request, context: Context) {
  const segments = (await context.params).path;
  const mutation = !["GET", "HEAD"].includes(request.method);
  if (CLOUD()) {
    let session: string;
    try {
      session = assertOwner(request, mutation);
    } catch (error) {
      return json({ error: (error as Error).message }, 401);
    }
    const origin = process.env.FOLIO_KEEPER_URL;
    const key = process.env.FOLIO_BRIDGE_KEY;
    if (!origin || !key || key.length < 32)
      return json(
        {
          error:
            "The keeper connection is not configured. Public recovery is still available.",
        },
        503,
      );
    try {
      const target = new URL(origin);
      if (
        target.protocol !== "https:" ||
        target.username ||
        target.password ||
        target.search ||
        target.hash ||
        target.pathname !== "/"
      )
        throw new Error("Invalid keeper configuration.");
      target.pathname = `/api/${segments.map(encodeURIComponent).join("/")}`;
      target.search = new URL(request.url).search;
      const headers = new Headers({ authorization: `Bearer ${key}` });
      if (request.headers.has("content-type"))
        headers.set("content-type", request.headers.get("content-type")!);
      let body: Uint8Array<ArrayBuffer> | undefined;
      try {
        body = mutation ? await limitedBody(request) : undefined;
      } catch {
        return json(
          { error: "Request too large. Upload files in 2 MB parts." },
          413,
        );
      }
      const upstream = await fetch(target, {
        method: request.method,
        headers,
        body,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(240000),
      });
      if (segments[0] === "state" && upstream.ok) {
        const value = await upstream.json();
        return json({ ...value, session: csrfToken(session) }, 200);
      }
      const safeHeaders = new Headers({
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      for (const key of [
        "content-type",
        "content-disposition",
        "content-security-policy",
      ])
        if (upstream.headers.has(key))
          safeHeaders.set(key, upstream.headers.get(key)!);
      return new Response(upstream.body, {
        status: upstream.status,
        headers: safeHeaders,
      });
    } catch {
      return json(
        {
          error:
            "The keeper could not be reached. Check that the computer and its secure connection are running. Published archives can still be recovered from Swarm.",
        },
        503,
      );
    }
  }
  try {
    const { assertLocal } = await import("@/lib/server/runtime");
    if (!bridgeAuthenticated(request)) assertLocal(request, mutation);
  } catch {
    return json({ error: "Keeper access denied." }, 403);
  }
  const { handleKeeper } = await import("@/lib/server/keeper-api");
  return handleKeeper(request, segments);
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
