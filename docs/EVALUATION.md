# Post-submission alignment review

Reviewed on September 19, 2026 UTC (September 20 IST), using the free prompt returned by `loops evaluate --event road-to-devcon-v --problem archive-that-outlives-its-host`, the published Test Cases tab, and the actual repository. The initial source was commit `c1a435f`; the fixes described below follow that review. This is a local application of the platform's evaluator instructions, not official judge feedback or an awarded score.

## Alignment summary

Folio directly addresses the archive-outlives-its-host brief. The public interface discovers the inventory from Swarm, resolves a stable feed, and verifies recovered bytes independently of publisher state. An operated Bee light node, real publication/update receipts, and a measured postage renewal support the infrastructure claims.

## Verified strengths

- The primary reading path calls `resolveArchive` from [the reading room](../src/components/reading-room.tsx#L140). It does not read the keeper's draft catalogue. [Network resolution](../src/lib/network.ts#L26) obtains the current snapshot and validates its identity.
- [Publication](../src/lib/server/publish.ts#L291) creates a feed manifest, uploads the directory separately, verifies every file through another endpoint, and then appends the snapshot reference. [Feed updates](../src/lib/server/feed-update.ts#L5) read the network's next index and reconcile ambiguous write failures.
- [Recovery](../src/lib/browser-recovery.ts#L19) checks streamed byte counts and SHA-256. It issues a complete ZIP only after every file succeeds. [Actual offline evidence](../evidence/hosting/offline-recovery.json) and [post-review browser recovery](../evidence/hosting/post-review-recovery.json) demonstrate all nine files without the local publisher or Bee.
- [Node observations](../src/lib/server/node-status.ts#L36) use the pinned SDK's postage data. The interface distinguishes live keeper observations from historical estimates; [the real renewal](../evidence/storage/ef65d5fe-c524-4809-a225-8e367e757635.json) records before/after values.

## Gaps found and changes made

1. **Copied links failed in the independent reader.** Its separate parser accepted `/bzz/` URLs but rejected the hosted `/archive/` links the app shares. The independent reader now uses the [shared address parser, network resolver, and format validation](../reader/src.js#L1). The actual copied link opened from a local HTML file and recovered all nine records. This also removes a weaker duplicate inventory validator.
2. **Cancelable requests lost their deadline.** The browser helper previously selected either the caller's signal or a timeout. Previews and cancelable ZIP downloads could therefore wait indefinitely on a stalled endpoint. [The helper now combines both signals](../src/lib/browser-recovery.ts#L27). The new [regression test](../tests/browser-recovery.test.ts#L145) failed on the old code and passes after the fix; it checks both timeout and user cancellation.
3. **Submission metadata and documentation drifted.** The problem form initially created a generic project name without the demo link. The approved Folio name, pitch, description, and demo URL are now saved and reread from Loops. Documentation no longer says the project is unsubmitted. [Submission observation](../evidence/submission/loops.json).

## Per-criterion assessment

| Published criterion | Assessment after fixes |
| --- | --- |
| Stable feed address | Implemented and used by ordinary share/recovery paths; three publication receipts retain the manifest. |
| Public owner/topic tracked | Actual identifiers are committed in `evidence/archives/`; no private key is required to read them. |
| Network supplies the next index | Implemented in `appendReference`; restart, conflict, first-write, and timeout tests substantiate the behavior. |
| Contents uploaded separately by reference | Directory upload precedes `uploadReference`; actual folios exceed a single chunk's payload. |
| Public-identifier-only recovery | Implemented in the browser, independent reader, and CLI; the copied-link gap is fixed and browser-verified. |
| Node-derived lifetime | SDK batch duration is read and timestamped. Historical estimates remain explicitly qualified. |
| Defined empty-feed behavior | Only the missing-first-feed case enables index zero; other failures propagate and readers show an error state. |
| No tracked secrets | Runtime credentials are excluded from Git/deployment inputs; the local credential scan passes. |
| Product judgment and code craft | Reading and recovery are the primary interface; a double-click recovery card avoids a developer-only handoff. Shared validation and bounded cancelable retrieval address the concrete weaknesses found. |

## Success-criteria fit and remaining limits

**Met for the demonstrated collection under the stated availability conditions:** a public address resolves all nine folios without the publisher, its database, or signing keys. The browser recovered a complete verified ZIP with local ports 3000 and 1633 unreachable.

The keeper deliberately runs on demand on the owner's computer. It must be started for publishing and maintenance; this review does not claim continuous node uptime. Storage must remain funded, and recovery needs a reachable public Bee endpoint. Collection limits are 200 files, 25 MiB per file, and 100 MiB total. These are operational limits, not guarantees removed by passing tests. Official scoring remains with the contest.

## Top three next steps - completed

1. Make copied public links work in the independent reader and share the full format validator.
2. Preserve retrieval deadlines alongside cancellation and verify both failure paths.
3. Save the approved submission metadata and make the repository's submission status accurate.

Validation: 20 automated tests, TypeScript checking, production build, and a real nine-file browser recovery after the changes. The copied-link recovery ZIP was independently checked against every inventory size and SHA-256.
