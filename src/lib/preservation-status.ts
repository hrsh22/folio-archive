import type { NodeStatus } from "./archive-format";
export type PreservationStatus = {
  online: boolean;
  ready: boolean;
  mode: string;
  version: string | null;
  peers: number;
  remainingSeconds: number | null;
  observedAt: string;
};
// An explicit allowlist: never proxy wallet data, private drafts, sessions, or keys.
export function publicPreservationStatus(
  node: NodeStatus,
  batchId: string,
): PreservationStatus {
  const batch = node.batches.find((b) => b.id === batchId);
  return {
    online: node.online,
    ready: node.ready,
    mode: node.mode,
    version: node.version || null,
    peers: node.peers,
    remainingSeconds: batch?.remainingSeconds ?? null,
    observedAt: node.observedAt,
  };
}
