# Repository evaluation: Problem 1

Reviewed 20 September 2026 against the freshly retrieved Loops prompt for **Eight hundred winters, one lapsed invoice** and the eight published Test Cases. The evaluated implementation was `62e0c281d12ca66174c257f2fb3a58a0e957d1ff`. The invocation and check results are recorded in [repo-review.json](../evidence/checks/repo-review.json).

`loops evaluate --event road-to-devcon-v --problem archive-that-outlives-its-host --format json` was run from this repository. It returned instructions, not an official score. The following assessment was performed against the code and committed evidence. A hosted demo is not needed to inspect the implementations below.

The follow-up [qualitative review](QUALITATIVE_REVIEW.md) documents the completed metadata editing, publication review, institution-handover guidance and real feed-index-3 publication.

## Alignment summary

Folio's normal reading path resolves the archive from Swarm, then verifies every recovered file. The stable feed manifest survives changes to the contents, and a separate recovery entrypoint takes only that public identifier and an endpoint. The repository contains actual publication, renewal and publisher-offline recovery observations.

## Verified strengths

- The browsing component calls [resolveArchive](../src/components/reading-room.tsx#L140), implemented in [network.ts](../src/lib/network.ts). The inventory is fetched from Swarm; local keeper drafts are not the public read index.
- [The publisher](../src/lib/server/publish.ts#L330) uploads the directory before [appendReference](../src/lib/server/feed-update.ts) signs a feed update. The public descriptor and all three publication receipts are tracked.
- [Browser recovery](../src/lib/browser-recovery.ts) and [CLI recovery](../tools/recover.ts) enforce byte counts and SHA-256. Missing or corrupt bytes cannot produce a complete report. [The independent reader](../reader/src.js) can operate without the publisher.
- [Node status](../src/lib/server/node-status.ts) reads real batch duration. The repository records a [completed renewal](../evidence/storage/ef65d5fe-c524-4809-a225-8e367e757635.json), rather than claiming permanent storage.

## All eight published technical checks

Weights identify the published rubric; they are not awarded scores. Each row is assessed as implemented and supported by the listed source and evidence.

| #   | Published check                         | Weight | Implementation, caller and proof                                                                                                                                                                                                                                              |
| --- | --------------------------------------- | -----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Publish behind a feed                   |      8 | `bee.feed.createManifest` in [publish.ts](../src/lib/server/publish.ts#L291); shares use `descriptor.manifestReference`. [Actual descriptor](../evidence/archives/77b9a322-61b9-40a1-b7a4-28aa35d6d0fd.json).                                                                 |
| 2   | Track the public owner and topic        |      6 | Both public values and the manifest occur in the tracked descriptor above, independently of private runtime configuration.                                                                                                                                                    |
| 3   | Resolve the next index from the network |     16 | [appendReference](../src/lib/server/feed-update.ts) calls `downloadReference` and uses `feedIndexNext`. [Feed tests](../tests/feed.test.ts) cover restart, conflict, timeout and first publication. No persistent local sequence counter is used.                             |
| 4   | Write larger content by reference       |     12 | [Directory upload](../src/lib/server/publish.ts#L330) precedes feed append. Receipts in [evidence/runs](../evidence/runs/) record roughly 61 KB folios separately from their snapshot reference.                                                                              |
| 5   | Recover from public identifiers alone   |     14 | [tools/recover.ts](../tools/recover.ts) -> [recovery.ts](../src/lib/recovery.ts) -> public network. [Recovery with publisher and Bee stopped](../evidence/recovery/publisher-and-bee-offline.json) and [post-review recovery](../evidence/hosting/post-review-recovery.json). |
| 6   | Read batch lifetime from the node       |      8 | [node-status.ts](../src/lib/server/node-status.ts) reads `stamp.getAll` and `duration.toSeconds`; [keeper-api.ts](../src/lib/server/keeper-api.ts#L129) exposes the result. Published snapshots retain observation time and duration for qualified estimates.                 |
| 7   | Define empty-feed behavior              |      8 | Only a confirmed first-feed 404 permits index zero in [feed-update.ts](../src/lib/server/feed-update.ts). [tests/feed.test.ts](../tests/feed.test.ts) proves old missing feeds and service failures do not become first writes. The reader catches unavailable-feed errors.   |
| 8   | Exclude tracked secrets                 |      8 | [.gitignore](../.gitignore), [.vercelignore](../.vercelignore), runtime-only key loading and [secret scan](../scripts/check-secrets.mjs). The scan passed against tracked/candidate files and actual local credentials.                                                       |

## Product judgment and code craft

The 20-point qualitative criterion specifically rejects a local mirror, a developer-only tool and false permanence claims. The source addresses these through the primary network-backed reading room, checksum-verified previews/recovery and a downloadable standalone recovery card. [Preservation status](../src/lib/preservation-status.ts) and the interface distinguish historical observations from live checks. These are implemented behaviors, not reliance on an attractive hosted screenshot.

## Reproduce without the hosted app

```sh
npm ci
npm test
npm run typecheck
npm run check:secrets
npm run build
npm run verify:archive -- --archive ebabde0eebd602ef6e66ed4cfda2a78b62f2f2d589548a0d5e1a3d791761d0b5
```

The first checks need no funded wallet. Public recovery needs a reachable Swarm endpoint but no keeper, account or private state. The follow-up test run passed all 29 tests. The follow-up public read recovered all nine files at feed index 3 with matching checksums and reviewed metadata. Prior signed/publication and offline observations remain separately timestamped in `evidence/`; tests are not presented as network transactions.

## Success fit

The implemented read path recovers the collection from its public address. The publisher, format, standalone reader and storage renewal are inspectable in this repository. [The qualitative review](QUALITATIVE_REVIEW.md) maps the complete 20-point product criterion to the updated publication and handover workflows.

## Three review priorities

1. Make the highest-weight next-index and public-recovery paths easy to locate: the exact source, callers, tests and receipts are mapped above.
2. Keep recovery and failure claims reproducible: the existing corruption, cancellation, restart and public-read checks pass; their commands are included here.
3. Preserve the availability distinction: storage observations are timestamped, the keeper is explicitly on demand, and no permanent-storage claim has been added.

No mechanical criterion was found unimplemented in this review. Final scoring remains with Loops.
