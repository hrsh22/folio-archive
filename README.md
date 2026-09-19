# Folio

**An archive beyond its keeper.**

[Open the live app](https://folio-archive.vercel.app) · [Read the real collection](https://folio-archive.vercel.app/archive/ebabde0eebd602ef6e66ed4cfda2a78b62f2f2d589548a0d5e1a3d791761d0b5) · [Inspect the proof](https://folio-archive.vercel.app/proof)

Folio is a reading room for collections that should outlive their publisher. Its normal browsing experience discovers an archive’s inventory from **Swarm**. Anyone can preview verified files, read earlier editions, recover a checksummed ZIP, or take a recovery card with an independent reader. The keeper can update the collection at one stable address through an operated, funded **Bee light node**.

Built for Road to Devcon V, Problem 1: **Eight hundred winters, one lapsed invoice**. One **Next.js 16 + TypeScript + shadcn/ui** application runs on Vercel. Bee, signing keys, editable drafts, and long publishing jobs remain on the keeper’s computer. The public reading room does not need that computer online.

## Try it in two minutes

1. [Open the collection](https://folio-archive.vercel.app/archive/ebabde0eebd602ef6e66ed4cfda2a78b62f2f2d589548a0d5e1a3d791761d0b5). Its title, inventory, and files are retrieved from a public Swarm endpoint.
2. Preview a folio or read the keeper’s note. Previews verify the file’s size and SHA-256 first.
3. Choose **Download verified archive**. The ZIP contains every original byte, `archive.json`, the public descriptor, and a per-file recovery report. Corruption or a missing file prevents a complete ZIP.
4. Choose **Save its recovery card**. Keep the ZIP somewhere else: it contains the owner, topic, stable manifest, instructions, and an independent static reader that can run after this website disappears.
5. Open **Previous edition**. The public address stays the same while immutable snapshots preserve earlier editions.

The folio illustrations are original **synthetic demonstration artwork**, not authentic manuscripts. [Provenance](public/samples/PROVENANCE.md).

## Public recovery address

[Copyable owner/topic descriptor](evidence/archives/77b9a322-61b9-40a1-b7a4-28aa35d6d0fd.json)

```text
ebabde0eebd602ef6e66ed4cfda2a78b62f2f2d589548a0d5e1a3d791761d0b5
```

This is a **feed manifest**, not a single edition’s upload reference. Neither a wallet nor a publisher account is required to read it.

### Recover from a fresh clone

Requires Node.js 22 and a reachable public Bee endpoint. No `.env.local`, funded node, local catalogue, signing key, or running publisher is needed.

```bash
npm ci
npm run recover -- \
  --descriptor evidence/archives/77b9a322-61b9-40a1-b7a4-28aa35d6d0fd.json \
  --out .runtime/recovered/my-copy
```

The new output folder must be inside the project. Success produces `complete/files/`, metadata, and a checksum report. Failure exits nonzero and leaves any partial output labelled incomplete. `archive.json` maps safe storage paths to original filenames.

For verification without saving files:

```bash
npm run verify:archive -- \
  --archive ebabde0eebd602ef6e66ed4cfda2a78b62f2f2d589548a0d5e1a3d791761d0b5
```

Use `--endpoint https://YOUR-BEE-ENDPOINT` to choose another endpoint. The independent fallback browser reader can also run with `npm run build:reader && npm run reader` at `http://127.0.0.1:3001`. It has no publisher API or private state dependency; normal visitors use the single hosted app.

Direct HTML navigation through the shared Swarm gateway may require its hash approval. Folio uses raw data retrieval, which was tested; no gateway approval or contest submission has been made.

## Run your keeper

```bash
npm ci
cp .env.example .env.local
npm run bee:install
npm run bee:start
```

The Bee installer checks the official release SHA-256 and keeps its binary, data and password inside ignored `.runtime/`. Set a Gnosis RPC in `.env.local`, fund the node, and restart for light mode. Without the RPC it starts read-only ultra-light mode. The demonstrated node is **Bee 2.8.2 / API 8.1.1**, with pinned **bee-js 13.1.0**. [Node instructions](docs/NODE.md).

In another terminal:

```bash
npm run build
npm start
```

Open **http://127.0.0.1:3000/manage**. The local keeper validates loopback hosts/origins and requires a session token for mutations. Use **Node & storage** to inspect the actual node and batch lifetime. Storage payments require an explicit reviewed quote. Create a collection, add files, then publish with an immutable batch. The public view is at `/`.

For a hosted keeper workspace, see [Vercel deployment and the secure local connection](docs/HOSTING.md). A fresh Vercel deployment fails closed until its keeper secrets and connection are configured. Public archive reading remains available.

## How publication works

1. Create a feed manifest and a dedicated archive-signing key. Only the public owner/topic/manifest is shareable.
2. Upload a complete immutable collection: `archive.json`, `bootstrap.json`, independent reader assets, and every `files/` entry.
3. Retrieve the inventory and every file through a different endpoint and verify size and SHA-256.
4. Read the feed’s **next index from Swarm immediately before each append**; write the snapshot reference with `uploadReference`. There is no local feed counter.
5. Resolve the public feed independently before reporting success. Save a public receipt and a durable local job record.

A feed write interrupted by a timeout is reconciled by reading the network. After a process restart, interrupted jobs require an explicit network recheck; they are never silently replayed. Draft edits are serialised and blocked during publication. Stale process locks are reclaimed only when the recorded publisher PID is no longer alive.

Recovery resolves once, then downloads all files from that immutable snapshot. A concurrent feed update cannot mix editions. The featured address is only a public navigation hint; no local inventory is used by readers. [Format and failure behavior](docs/ARCHITECTURE.md).

## Evidence and checks

[Live evidence index](evidence/README.md) · [Criterion-by-criterion audit](docs/RUBRIC_AUDIT.md) · [Demo walkthrough](docs/DEMO.md)

The evidence distinguishes real network observations from automated tests. It includes publication/update receipts, a real storage renewal, recovery with both publisher and Bee stopped, and an authenticated **5 MiB upload/download through Vercel using 2 MiB parts**.

```bash
npm test
npm run typecheck
npm run check:secrets
npm run build
```

Tests cover feed restart/empty/conflict/timeout behavior, malformed archives, corrupt and missing bytes, browser ZIP verification, session tampering/expiry/CSRF, chunk retries and idempotent finalisation, and interrupted-job recovery. CI uses no keys or funded access.

| Published criterion | Implementation and evidence |
| --- | --- |
| Stable feed address | [Publisher](src/lib/server/publish.ts), same manifest across receipts |
| Public owner/topic in tracked file | [Actual descriptor](evidence/archives/77b9a322-61b9-40a1-b7a4-28aa35d6d0fd.json) |
| Network supplies every next index | [Feed append](src/lib/server/feed-update.ts), [failure tests](tests/feed.test.ts) |
| Multi-chunk contents uploaded by reference | [Directory upload before feed append](src/lib/server/publish.ts) |
| Recovery from only public identifiers | [Network reader](src/lib/network.ts), [browser recovery](src/lib/browser-recovery.ts), [CLI](tools/recover.ts) |
| Actual node-derived lifetime | [Node status](src/lib/server/node-status.ts), [renewal receipt](evidence/storage/ef65d5fe-c524-4809-a225-8e367e757635.json) |
| Defined empty feed behavior | [404-only first write](src/lib/server/feed-update.ts), caught reader errors |
| No committed credentials | [.gitignore](.gitignore), [.vercelignore](.vercelignore), [secret checks](scripts/check-secrets.mjs) |

## Honest limits

- Prepaid storage needs renewal. The keeper shows live, timestamped node observations; the reader shows a clearly labelled estimate from the last publication. Availability is not a promise of permanence.
- 200 files, 25 MiB per file, 100 MiB per collection. Browser ZIPs use memory; the CLI buffers one bounded file at a time.
- Collections are public. Private signing keys are needed for future writes, never public recovery. Back up those keys privately; this entry does not implement governance or publisher succession.
- An archive stays on its original immutable batch, so renewing it maintains its manifest and feed dependencies. Batch migration is not implemented.
- Publishing and maintenance need the keeper computer awake, Bee running, and its connection available. The demo uses a temporary Cloudflare quick tunnel; a stable named tunnel or VPS is a later operations step. Public recovery does not depend on that tunnel.
- The single-owner login uses a random access key and an eight-hour signed, HttpOnly session. Logging out clears the browser cookie; rotating the owner key invalidates all sessions.
- The tests and audit are our verification, **not an awarded contest score**. The project has not been submitted to Loops.

## Repository

```text
src/app/                 Public reading room, keeper, proof, and protected API
src/components/          React and shadcn/ui interfaces
src/lib/server/          Persistent keeper, node, postage, publication, chunks
src/lib/                 Public format, network resolution, independent recovery
reader/                  Independent static reader source
public/reader/           Built reader, also included in Swarm snapshots
tools/recover.ts         Independent recovery / verification command
scripts/                 Bee lifecycle, hosting setup, checks
tests/                   Consequential behavior tests
evidence/                Public observations and verification reports
docs/                    Format, node, hosting, rubric, walkthrough
.runtime/                Ignored local data and credentials
```
