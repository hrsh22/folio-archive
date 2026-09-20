import { BeeResponseError } from "@ethersphere/bee-js";
import { setTimeout as delay } from "node:timers/promises";

function retryable(error: unknown) {
  // SDK transport failures have no HTTP status. Parsing, schema and checksum
  // errors are not transport errors and must fail immediately.
  return (
    error instanceof BeeResponseError &&
    (error.status === undefined ||
      error.status === 404 ||
      error.status === 408 ||
      error.status === 429 ||
      error.status >= 500)
  );
}

/** Retry reads of the same immutable snapshot, never an upload or feed write. */
export async function retryNetworkVerification<T>(
  verify: (signal: AbortSignal) => Promise<T>,
  onRetry: () => void,
  { timeoutMs = 120_000, retryDelayMs = 4_000 } = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const expired = () =>
    new Error(
      `The public gateway did not verify this archive within ${timeoutMs / 1000} seconds. Recheck the publication before retrying.`,
    );
  try {
    for (;;) {
      try {
        const result = await verify(controller.signal);
        if (controller.signal.aborted) throw expired();
        return result;
      } catch (error) {
        if (controller.signal.aborted) throw expired();
        if (!retryable(error)) throw error;
        onRetry();
        try {
          await delay(retryDelayMs, undefined, { signal: controller.signal });
        } catch {
          throw expired();
        }
      }
    }
  } finally {
    clearTimeout(timeout);
  }
}
