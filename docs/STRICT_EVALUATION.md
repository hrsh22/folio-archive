# Strict Loops evaluation: Folio

[Evaluator command, response fingerprint and reviewed CI](../evidence/strict-evaluation.json)

Reviewed 20 September 2026 at implementation `57986074bf62be4e3fd5c52ee60b28bad2f233fd` using the freshly retrieved `loops evaluate --event road-to-devcon-v --problem archive-that-outlives-its-host --format json` prompt. This is a source-based alignment review, not a Loops score. The quoted "twenty points the checklist cannot reach" paragraph is the published qualitative criterion in that response, and is assessed explicitly below.

## Alignment summary

Folio directly implements the brief's stable public archive: its ordinary reading room resolves a Swarm feed, obtains the inventory from the resulting snapshot and retrieves the files from that snapshot. Deliberate metadata review, explicit expiry information and a portable reader are implemented and wired into the application. One worthwhile qualitative refinement remains in the complete downloaded archive: its filenames are storage identifiers, and the reviewed names and descriptions are available only through JSON rather than a human-readable offline catalogue.

## Verified strengths

- **The normal catalogue is fetched from Swarm.** Both the [home route](../src/app/page.tsx) and [archive route](../src/app/archive/%5Breference%5D/page.tsx) render `ReadingRoom`. Its [loading effect](../src/components/reading-room.tsx#L132) calls `resolveArchive`; [network.ts](../src/lib/network.ts#L25) downloads `bootstrap.json`, reads the owner/topic feed and downloads `archive.json` from the selected snapshot. Search filters that retrieved inventory. Failed retrieval clears the inventory and shows an error; there is no local sample-inventory fallback.
- **The keeper's address book does not become the public catalogue.** Even the keeper's existing-archive endpoint [reads the latest network snapshot](../src/lib/server/keeper-api.ts#L275). Editing an existing edition first retrieves its inventory and verifies the original bytes from Swarm.
- **The visible product serves a reader.** [ReadingRoom](../src/components/reading-room.tsx#L412) provides filenames, descriptions, visual previews, search, a complete verified download and a recovery card. The [standalone reader](../reader/src.js#L36) opens a saved public address, presents the same metadata and supports verified individual and complete downloads. No CLI is required for these paths.
- **Metadata editing reaches the publication.** The [item editor](../src/components/file-details-dialog.tsx), [parent save callback](../src/components/folio-app.tsx#L1321), [validated metadata route](../src/lib/server/keeper-api.ts#L225), [publication review](../src/components/publication-review.tsx) and [archive serialization](../src/lib/server/publish.ts#L314) form a complete path. The review explains embedded metadata, public visibility and preservation of earlier editions. The [published metadata receipt](../evidence/checks/qualitative-publication.json) records all nine reviewed items at feed index 3 with their original bytes unchanged.
- **Storage is renewable, not described as permanent.** [Node status](../src/lib/server/node-status.ts#L37) obtains actual batch duration. The [reading room's estimate and footnote](../src/components/reading-room.tsx#L624) identify the observation time, renewal and changing prices; the [standalone reader](../reader/src.js#L54) calls its figure historical. The [renewal receipt](../evidence/storage/ef65d5fe-c524-4809-a225-8e367e757635.json) records an actual extension.
- **The handover artifact anticipates a move.** [Recovery-card packaging](../src/lib/browser-recovery.ts#L122) embeds the standalone reader and public address. Its guide explains giving the next custodian both the card and a verified copy, trying recovery before institutional access ends, assigning renewal responsibility and keeping signing credentials separate from the public card. The [card test](../tests/browser-recovery.test.ts) checks that the HTML has no external script or stylesheet dependency.

## The exact twenty-point criterion

These are evidence-based findings, not awarded points.

| Part of the criterion | Assessment from the implementation |
| --- | --- |
| Reject the mirror | **Avoided.** The primary list is `resolved.archive.files` from `resolveArchive`, not the keeper's draft store. The [network-only recovery receipt](../evidence/checks/qualitative-publication.json) corroborates the source path. |
| Reject the developer tool | **Avoided in the primary application.** The reading room and saved reader expose ordinary item names and one-click verified downloads. **Remaining refinement:** the complete extracted ZIP requires JSON to map storage filenames to the reviewed labels. |
| Reject the false promise | **Avoided.** The UI presents dated storage observations and renewal language, including the standalone reader and public recovery instructions. No indefinite-retention claim is needed to explain the product. |
| Recovery is plainly primary | **Supported.** The normal archive page already uses the same public feed and snapshot that recovery uses; it does not display a separate local mirror and offer a Swarm export as an afterthought. Complete verified download is a primary archive action. |
| Published information is deliberately chosen | **Supported.** Each public filename, description, source and collection note is editable and appears in review before publication. Original-file metadata and earlier editions are expressly disclosed. The nine-item publication receipt demonstrates this beyond component scaffolding. |
| Thought given to the researcher moving institutions | **Supported, with one actionable refinement.** The portable reader, recovery address, descriptions/provenance and custodian instructions preserve context and access. A readable catalogue inside the full recovered ZIP would preserve that context for someone who opens the files without the reader. |

## All eight mechanical checks

The weights below identify the published checks; they are not scores awarded by this review.

| Check | Weight | Source assessment and evidence |
| --- | ---: | --- |
| Stable address behind a feed | 8 | **Implemented.** [publish.ts](../src/lib/server/publish.ts#L300) calls `bee.feed.createManifest`; shares retain `descriptor.manifestReference`. The [public descriptor](../evidence/archives/77b9a322-61b9-40a1-b7a4-28aa35d6d0fd.json) is tracked. |
| Public owner and topic retained | 6 | **Implemented.** The descriptor contains owner, topic and manifest reference; both recovery artifacts retain the public descriptor. |
| Next index resolved from the network | 16 | **Implemented.** [appendReference](../src/lib/server/feed-update.ts) reads `downloadReference().feedIndexNext`, checks the expected previous reference and reconciles uncertain writes. [Feed tests](../tests/feed.test.ts) exercise restart, first publication, conflict and timeout paths. |
| Large content published by reference | 12 | **Implemented.** [publish.ts](../src/lib/server/publish.ts#L342) uploads the directory, verifies the immutable snapshot through another endpoint, then appends only its reference. The [index-3 publication receipt](../evidence/checks/qualitative-publication.json) records nine recovered files including approximately 61 KB images. |
| Recovery from public identifiers only | 14 | **Implemented.** [network.ts](../src/lib/network.ts), [browser recovery](../src/lib/browser-recovery.ts) and [CLI recovery](../src/lib/recovery.ts) need the descriptor/address and retrieval endpoint, not keeper credentials. The [public recovery receipt](../evidence/checks/qualitative-publication.json) verifies all nine hashes. |
| Batch lifetime from Bee | 8 | **Implemented.** [node-status.ts](../src/lib/server/node-status.ts) uses `stamp.getAll` and `duration.toSeconds`; publication saves the observation time and lifetime. |
| Defined empty-feed behavior | 8 | **Implemented.** [feed-update.ts](../src/lib/server/feed-update.ts) permits index zero only for a confirmed missing feed with no expected previous reference. Existing missing feeds and service failures are not silently overwritten; the public reader displays a recoverable error. |
| No tracked private credentials | 8 | **Supported.** Runtime key loading and ignored private state are separate from public descriptors. The [secret scanner](../scripts/check-secrets.mjs) is required by [CI](../.github/workflows/ci.yml), with a successful implementation release recorded in [release-verification.json](../evidence/release-verification.json). |

## Specific improvement and verification boundary

The complete ZIP writes each object under `file.path` in both [browser recovery](../src/lib/browser-recovery.ts#L96) and the [standalone reader](../reader/src.js#L137). Those paths intentionally preserve immutable storage identifiers. However, the browser ZIP's `READ-ME.txt` directs the recipient to `archive.json` for the names and descriptions, and the standalone ZIP does not include an equivalent plain guide. The nine published files use `files/<UUID>.<extension>` paths. This is an inspectable usability gap in a valid recovery artifact, rather than lost bytes or a failed public read.

This review inspected source and the committed publication, recovery, browser and CI evidence. The existing release record reports 29 passing automated tests, typecheck, secret scan and production build. It does not substitute an automated test count for qualitative judgment. No new publication, funded transaction or first-time-archivist usability session was performed in this evaluation.

## Success-criteria fit

**Met for the brief's technical outcome.** A small collection is published through a stable feed, later editions retain its public address, the network determines the append index, and independent recovery validates every original file. The primary reading experience, deliberate metadata workflow and explicit renewable storage address the qualitative rejection patterns. The extracted archive's presentation is the clearest remaining refinement for a nontechnical custodian.

## Top three next steps

1. Add a self-contained, human-readable catalogue to every complete recovery ZIP, with the reviewed filenames, descriptions, sources and relative links to the verified original files. Preserve `archive.json` and storage paths for exact format fidelity.
2. Make the browser and standalone ZIPs include the same plain recovery guide and catalogue so changing readers does not change the handover experience.
3. Verify that artifact with a focused test: extract a recovered collection, open the catalogue without network requests and confirm that reviewed labels, provenance and all file links work. Include hostile labels and duplicate public filenames so the presentation cannot introduce HTML injection or overwrite original files.

Final qualitative scoring remains with Loops. No numeric score is inferred from this assessment.
