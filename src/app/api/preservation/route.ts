import { CLOUD } from "@/lib/server/access";
import { publicPreservationStatus } from "@/lib/preservation-status";
import publication from "../../../../evidence/runs/8b989dc7-b78c-473e-84ad-bc2139e4ff9d.json";
import type { NodeStatus } from "@/lib/archive-format";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    let node: NodeStatus;
    if (CLOUD()) {
      const key = process.env.FOLIO_BRIDGE_KEY;
      const url = new URL(process.env.FOLIO_KEEPER_URL || "");
      if (
        !key ||
        key.length < 32 ||
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname !== "/"
      )
        throw new Error("Unavailable");
      url.pathname = "/api/node";
      const response = await fetch(url, {
        headers: { authorization: `Bearer ${key}` },
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error("Unavailable");
      node = await response.json();
    } else {
      const { nodeStatus } = await import("@/lib/server/node-status");
      node = await nodeStatus();
    }
    return Response.json(
      publicPreservationStatus(node, publication.storage.id),
      { headers: { "Cache-Control": "public, s-maxage=30, max-age=0" } },
    );
  } catch {
    return Response.json(
      {
        online: false,
        ready: false,
        mode: "unavailable",
        version: null,
        peers: 0,
        remainingSeconds: null,
        observedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "public, s-maxage=15, max-age=0" } },
    );
  }
}
