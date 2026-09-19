import Link from "next/link";
import { LivePreservation } from "@/components/live-preservation";
import { ArrowLeft, ArrowRight, Check, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import offline from "../../../evidence/hosting/offline-recovery.json";
import publication from "../../../evidence/runs/8b989dc7-b78c-473e-84ad-bc2139e4ff9d.json";
import renewal from "../../../evidence/storage/ef65d5fe-c524-4809-a225-8e367e757635.json";
import descriptor from "../../../evidence/archives/77b9a322-61b9-40a1-b7a4-28aa35d6d0fd.json";
export default function Proof() {
  return (
    <main className="proof-page">
      <Link href="/" className="text-button">
        <ArrowLeft size={15} /> Back to the reading room
      </Link>
      <p className="eyebrow">THE WORK BEHIND THE WORDS</p>
      <h1>
        Trust the records.
        <br />
        <em>Check the work.</em>
      </h1>
      <p className="proof-intro">
        These are observations from a real Bee light node and a real archive on
        Swarm. The collection is synthetic demonstration artwork. Its
        publication, update, renewal, and recovery are real.
      </p>
      <LivePreservation />
      <section className="proof-metrics">
        <div>
          <strong>3</strong>
          <span>verified editions at one public address</span>
        </div>
        <div>
          <strong>
            {offline.files.length} / {offline.files.length}
          </strong>
          <span>files recovered with the publisher off</span>
        </div>
        <div>
          <strong>
            {(renewal.after[0].remainingSeconds / 86400).toFixed(1)} days
          </strong>
          <span>observed after storage renewal</span>
        </div>
      </section>
      <div className="proof-timeline">
        {[
          [
            "01",
            "A running, funded light node",
            `Bee ${publication.node.version} ran in ${publication.node.mode} mode with ${publication.node.peers} peers at the publication observation. Its postage batch is immutable and renewable.`,
            publication.observedAt,
          ],
          [
            "02",
            "One address, three editions",
            "Six records became eight, then nine in an edition published through the hosted keeper. All three used the same public feed manifest. The writer read the network’s next index immediately before appending the separately uploaded snapshot reference.",
            publication.observedAt,
          ],
          [
            "03",
            "A measured renewal",
            `The node reported ${renewal.before[0].remainingSeconds.toLocaleString()} seconds before renewal and ${renewal.after[0].remainingSeconds.toLocaleString()} seconds after it. This is a historical observation, not a live balance.`,
            renewal.observedAt,
          ],
          [
            "04",
            "The disappearance test",
            "The publishing app and local Bee node were stopped, and the publisher’s state directory was temporarily moved. An independent recovery process used only the public descriptor and another Bee endpoint. Every file passed its size and SHA-256 checks.",
            offline.observedAt,
          ],
        ].map(([n, title, body, date]) => (
          <section key={n}>
            <span>{n}</span>
            <div>
              <h2>{title}</h2>
              <p>{body}</p>
              <small>
                Observed {date.replace("T", " ").replace("Z", " UTC")}
              </small>
            </div>
            <Check size={20} />
          </section>
        ))}
      </div>
      <section className="proof-address">
        <ShieldCheck size={24} />
        <h2>Reproduce it yourself.</h2>
        <p>
          Open the collection and choose “Download verified archive.” Your
          browser will read the network and produce its own checksummed recovery
          report. The recovery card also includes a standalone reader.
        </p>
        <code>{descriptor.manifestReference}</code>
        <Button asChild>
          <Link href={`/archive/${descriptor.manifestReference}`}>
            Recover the collection <ArrowRight size={16} />
          </Link>
        </Button>
      </section>
      <p>
        <a
          className="text-button"
          href="https://github.com/hrsh22/folio-archive"
          target="_blank"
          rel="noopener noreferrer"
        >
          Inspect the source and receipts on GitHub <ArrowRight size={14} />
        </a>
      </p>
      <section className="proof-limits">
        <h2>What this proves—and what it takes.</h2>
        <p>
          The archive was recoverable without its publisher at the recorded
          time. Storage still needs renewal; network availability and gateway
          service are not guaranteed. Editing requires the keeper’s computer to
          be online. Reading uses a public endpoint and does not require that
          computer.
        </p>
        <p>
          The repository includes the public owner/topic descriptor, per-file
          hashes, publication receipts, renewal observations, automated tests,
          and the independent recovery tool. None of these records is a contest
          score.
        </p>
      </section>
    </main>
  );
}
