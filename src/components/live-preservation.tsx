"use client";
import { useEffect, useState } from "react";
import { Radio } from "lucide-react";
import type { PreservationStatus } from "@/lib/preservation-status";
export function LivePreservation() {
  const [status, setStatus] = useState<PreservationStatus | null>(null),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    async function check() {
      try {
        const r = await fetch("/api/preservation", {
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
        });
        if (!r.ok) throw new Error();
        const value = await r.json();
        if (alive) {
          setStatus(value);
          setFailed(false);
        }
      } catch {
        if (alive) {
          setStatus(null);
          setFailed(true);
        }
      }
    }
    void check();
    const timer = setInterval(check, 30000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  const fresh = status && Date.now() - Date.parse(status.observedAt) < 90000;
  return (
    <section
      className="live-preservation"
      aria-label="Public Bee node observation"
    >
      <div className="live-preservation-title">
        <Radio size={19} />
        <div>
          <strong>
            {status?.ready && fresh
              ? "The keeper’s Bee node is connected."
              : status?.online && fresh
                ? "The keeper’s Bee node is connecting."
                : status || failed
                  ? "The keeper is currently unreachable."
                  : "Checking the keeper’s Bee node…"}
          </strong>
          <p>Reading and recovery work independently of this computer.</p>
        </div>
        <span
          className={`status-dot ${status?.ready && fresh ? "green" : "amber"}`}
        />
      </div>
      {status?.online && fresh && (
        <dl>
          <div>
            <dt>NODE MODE</dt>
            <dd>{status.mode}</dd>
          </div>
          <div>
            <dt>BEE VERSION</dt>
            <dd>{status.version?.split("-")[0] || "—"}</dd>
          </div>
          <div>
            <dt>CONNECTED PEERS</dt>
            <dd>{status.peers}</dd>
          </div>
          <div>
            <dt>OBSERVED POSTAGE</dt>
            <dd>
              {status.remainingSeconds === null
                ? "Unavailable"
                : `≈ ${(status.remainingSeconds / 86400).toFixed(1)} days`}
            </dd>
          </div>
        </dl>
      )}
      <small>
        {status
          ? `Observed ${new Date(status.observedAt).toLocaleString()} · checked every 30 seconds`
          : "Public status contains no signing key, wallet access, or editing credentials."}
      </small>
    </section>
  );
}
