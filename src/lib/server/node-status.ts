import { makeBee } from "../network";
import type { BatchStatus, NodeStatus } from "../archive-format";
import { BEE_URL } from "./runtime";

export async function nodeStatus(): Promise<NodeStatus> {
  const observedAt = new Date().toISOString();
  const base: NodeStatus = {
    online: false,
    ready: false,
    mode: "offline",
    peers: 0,
    compatible: false,
    batches: [],
    observedAt,
    message: "Start the local Bee node with npm run bee:start.",
    rpcConfigured: Boolean(process.env.BEE_BLOCKCHAIN_RPC_ENDPOINT),
  };
  const bee = makeBee(BEE_URL);
  try {
    const health = await bee.status.getHealth({ timeout: 4000 });
    const info = await bee.status.getNodeInfo({ timeout: 4000 });
    const [status, addresses, compatibility, readiness] =
      await Promise.allSettled([
        bee.status.get({ timeout: 4000 }),
        fetch(`${BEE_URL}/addresses`, {
          signal: AbortSignal.timeout(4000),
        }).then((r) => r.json()),
        bee.status.isSupportedApiVersion({ timeout: 4000 }),
        bee.status.getReadiness({ timeout: 4000 }),
      ]);
    const mode = info.beeMode;
    let batches: BatchStatus[] = [];
    let stampError = false;
    if (mode === "light" || mode === "full") {
      try {
        batches = (await bee.stamp.getAll({ timeout: 6000 })).map((batch) => ({
          id: batch.batchID.toHex(),
          label: batch.label,
          usable: batch.usable,
          immutable: batch.immutableFlag,
          remainingSeconds: Math.max(0, batch.duration.toSeconds()),
          capacity: batch.size.toBytes(),
          remainingBytes: batch.remainingSize.toBytes(),
          usage: batch.usage,
        }));
      } catch {
        stampError = true;
      }
    }
    const ready =
      (mode === "light" || mode === "full") &&
      readiness.status === "fulfilled" &&
      compatibility.status === "fulfilled" &&
      compatibility.value &&
      !stampError;
    return {
      ...base,
      online: true,
      ready,
      mode,
      version: health.version,
      compatible: compatibility.status === "fulfilled" && compatibility.value,
      wallet:
        addresses.status === "fulfilled" ? addresses.value.ethereum : undefined,
      peers: status.status === "fulfilled" ? status.value.connectedPeers : 0,
      batches,
      message:
        mode === "ultra-light"
          ? "Your node is connected for reading. Add a Gnosis RPC and fund it to enable publishing."
          : stampError
            ? "Connected, but postage information could not be read. Retry before publishing."
            : !ready
              ? "Bee is starting or synchronising. Publishing will be available when it is ready."
              : batches.some((b) => b.usable && b.immutable)
                ? "Your node is ready to preserve an archive."
                : "Your node is ready. Purchase an immutable storage batch to publish.",
    };
  } catch {
    return base;
  }
}
