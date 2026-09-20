# Rubric audit - September 19, 2026

Reviewed against the signed-in [Problem 1 Test Cases tab](https://www.loops.house/road-to-devcon-v/workspace) and the `loops evaluate` evaluator prompt for **Eight hundred winters, one lapsed invoice**. These weights are published criteria, not awarded marks. No official score or guarantee of winning is claimed.

## Eight scored checks

| Check | Weight | Concrete implementation and evidence |
| --- | ---: | --- |
| The archive address is a feed address | 8 | `publish.ts` creates a feed manifest before the first snapshot. Share URLs embed `descriptor.manifestReference`. Three real publication receipts use the same manifest with different snapshot references. |
| Public owner and topic are tracked | 6 | `evidence/archives/77b9a322-61b9-40a1-b7a4-28aa35d6d0fd.json` contains the actual public owner, topic and manifest. It is a repository deliverable, not environment-only state. |
| Network supplies every next index | 16 | `feed-update.ts` calls `downloadReference()` immediately before using `feedIndexNext` for `uploadReference`. Only a confirmed missing first feed with no expected previous snapshot uses the defined initial index. Restart, conflict, 404, timeout and idempotence tests cover this behavior. |
| Contents uploaded separately by reference | 12 | `publish.ts` uploads the complete directory, independently verifies it, then writes its reference to the feed. The folio SVGs are each about 61 KB; the feed does not carry those raw contents. |
| Recovery needs only public identifiers and an endpoint | 14 | `network.ts`, `browser-recovery.ts`, `recovery.ts` and `tools/recover.ts` discover the inventory from Swarm. The public UI uses that path by default. Actual recovery was repeated after stopping the publisher and local Bee and moving publisher state aside. |
| Lifetime comes from the node | 8 | `node-status.ts` reads `bee.stamp.getAll()` and `batch.duration.toSeconds()`. The keeper shows a timestamped observation; snapshots carry it for a clearly historical reader estimate. A real renewal increased observed TTL from 604,288 to 1,209,038 seconds. |
| Empty feed is a defined case | 8 | Only `BeeResponseError` 404 with no expected prior value enables the first write. Other errors propagate. Readers show a caught, actionable unavailable/first-edition state rather than a crash. |
| No tracked secrets | 8 | Runtime keys/passwords and environment files are excluded from Git, deployment inputs, and function tracing. Exact local-credential matching and generic secret patterns are checked before release. Public receipts use explicit public fields. |

## Twenty-point product criterion

The published qualitative criterion rewards recovery/read as the primary product experience and penalises local mirrors, developer-only recovery, and false permanence claims.

The previous material gaps were addressed:

- `/` is now the public reading room. Its featured address is only a navigation hint; the title, inventory and bytes are read from Swarm. Local drafts are confined to `/manage`.
- `/archive/<feed-manifest>` is the ordinary collection view. It supports verified previews, text records, earlier editions, per-file downloads, complete verified ZIP recovery, and a downloadable public recovery card with a standalone reader.
- The app is live on Vercel. Sharing no longer opens another person’s loopback reader.
- Keeper authentication and the bridge protect publishing and payment routes. A real 5 MiB transfer passed through Vercel in 2 MiB parts. Publishing executes on the persistent keeper and can survive a browser disconnect; durable state supports explicit reconciliation after a process restart.
- Storage estimates remain qualified and observed. The UI and documentation explain renewal, offline keepers, and what a recovery card can and cannot do.
- The proof page and repository evidence let a reader inspect or repeat the key claims without receiving a private credential.
- The recovery card now includes a single HTML file with its reader, styles, and public archive address inside. An actual browser opened it directly from disk and recovered all nine files; every file was checked again against the inventory. No local server was required.

## Evidence to inspect first

1. [Public descriptor](../evidence/archives/77b9a322-61b9-40a1-b7a4-28aa35d6d0fd.json).
2. [First](../evidence/runs/51c227eb-4bc5-4ae4-a022-2f353f89ca47.json), [second](../evidence/runs/97f43c4f-de5c-42b2-a037-9199bff687bd.json), and [hosted third](../evidence/runs/8b989dc7-b78c-473e-84ad-bc2139e4ff9d.json) publications. Compare manifest, snapshot, previous snapshot, feed index and verified file list.
3. [Initial offline recovery](../evidence/recovery/publisher-and-bee-offline.json), plus the later hosted/offline records in `evidence/hosting/`.
4. [Real renewal](../evidence/storage/ef65d5fe-c524-4809-a225-8e367e757635.json) and its [Gnosis receipt](../evidence/storage/transaction-8a3abaf6.json).
5. [Deployed API integration](../evidence/hosting/vercel-integration.json), [hosted browser ZIP](../evidence/hosting/browser-zip.json), and deterministic failure tests in `tests/`.
6. [Single-file recovery card](../evidence/hosting/single-file-recovery.json), opened as a local HTML file and independently checksum-verified after download.

## Assessment and remaining operational limits

Every published technical check now has a corresponding implementation and inspectable evidence. The main presentation risk from the earlier audit - local drafts as the primary reading experience - is resolved. Judges still determine the actual score; a checklist cannot establish subjective marks or continuous availability.

Public recovery is independently reproducible. Storage must remain funded and a retrieval endpoint must be reachable; indefinite availability is not claimed. Browser observations, failure tests and actual transactions are recorded separately so a reviewer can distinguish them.

Folio was subsequently submitted for Problem 1 with the builder's approval. See the [submission observation](../evidence/submission/loops.json) and [post-submission review and fixes](EVALUATION.md). No official score has been returned.
