# The twenty points: interpretation and product judgment

This review applies the published Problem 1 qualitative criterion to the actual implementation. It is a source map and verification record, not an awarded score. Reviewers can inspect each behavior from this repository without opening a hosted application.

| Criterion                      | Implemented behavior                                                                                                                                                                                                                                                                              | Inspectable source and evidence                                                                                                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recovery is the primary path   | The main reading room loads its inventory from the public Swarm feed. The featured address contains no inventory. Previews and downloads fetch the published files.                                                                                                                               | [Reading room](../src/components/reading-room.tsx), [network resolution](../src/lib/network.ts), [publisher-off recovery](../evidence/recovery/publisher-and-bee-offline.json)                                              |
| Usable by an archivist         | Visual item previews, search, ordinary file names, complete verified download, and a recovery card with a double-click reader. Protocol identifiers live in secondary details.                                                                                                                    | [Reading room](../src/components/reading-room.tsx), [card packaging](../src/lib/browser-recovery.ts), [standalone reader](../reader/src.js)                                                                                 |
| Deliberate publication         | Keepers edit each public filename, description and source. A review lists every item and collection note before publication. It explains original-file metadata and earlier editions.                                                                                                             | [Item editor](../src/components/file-details-dialog.tsx), [publication review](../src/components/publication-review.tsx), [keeper API](../src/lib/server/keeper-api.ts), [five route tests](../tests/file-metadata.test.ts) |
| Honest storage                 | The node supplies observed lifetime; public editions retain its timestamp, and the UI explains renewal. A real extension receipt records the same batch.                                                                                                                                          | [Node status](../src/lib/server/node-status.ts), [storage operations](../src/lib/server/storage.ts), [renewal receipt](../evidence/storage/ef65d5fe-c524-4809-a225-8e367e757635.json)                                       |
| Continuity across institutions | The public card and verified archive can be handed to another custodian. Plain instructions ask them to check recovery and agree renewal responsibility, keeping publishing credentials in a separate private handover. Source and descriptive context survive in the inventory and both readers. | [Recovery card and guide](../src/lib/browser-recovery.ts), [reader](../reader/src.js), [verified ZIP tests](../tests/browser-recovery.test.ts)                                                                              |

## Why a metadata edit does not change the original

`PATCH /api/drafts/:id/files/:fileId` accepts only `name`, `caption` and `source`. It validates public labels, preserves the file ID/path/type/size/hash, and advances the draft timestamp. Authentication, same-origin mutation checks, the existing serialized mutation queue and active-publication lock apply. Tests read back the original bytes, exercise concurrent edits and reject requests attempting to alter immutable properties.

Publication serializes the reviewed fields through the existing versioned archive schema. The network feed carries only the snapshot reference. Each reader obtains the inventory and file bytes from that snapshot; the keeper draft is not a public catalogue.

## Browser verification

The actual keeper UI was exercised in Chrome: open publication review; edit an item; reject a path-like filename with a focused inline error; save a valid filename, description and source; see all three reflected in publication review; edit the collection note and cancel back to review. The review remains usable before a write is attempted. This is a browser observation, separate from the automated route tests.

## Published metadata proof

The [new publication and recovery receipt](../evidence/checks/qualitative-publication.json) records feed index 3 at the same archive address. All nine items have public names, descriptions and sources. Recovery from the public gateway verified each original file hash unchanged and matched the exact reviewed metadata. The receipt distinguishes two safely rejected attempts from the one completed feed append.

Independent snapshot verification now retries transient gateway propagation responses for a bounded 120 seconds, using the same immutable reference. Corrupt bytes and invalid inventories fail immediately. [Regression tests](../tests/verification-retry.test.ts) cover the retry window and abort deadline. [Validation receipt](../evidence/checks/qualitative-review.json) records the 29-test run, build and source hashes.

## Reproduce

```sh
npm ci
npm test
npm run typecheck
npm run check:secrets
npm run build
```

For a public-network recheck using the stable address and no publisher credentials:

```sh
npm run verify:archive -- --archive ebabde0eebd602ef6e66ed4cfda2a78b62f2f2d589548a0d5e1a3d791761d0b5
```

The README and repository review map the eight mechanical checks separately. Qualitative interpretation is assessed through the primary read path, the complete public review workflow and the handover artifact, not inferred from the number of passing tests.
