# Live evidence

These are actual observations from **September 19, 2026**, not fixtures or a claim of continuous uptime. The source and deterministic failure tests are separate from this network evidence.

## What was demonstrated

| Check | Result | Evidence |
| --- | --- | --- |
| Operated a local funded Bee | Bee 2.8.2, API 8.1.1, light mode; wallet and chequebook on Gnosis | [Node observation](node/observation.json) |
| Published a full first version | Six SVG folios, all larger than 4 KB, independently verified | [First publication](runs/51c227eb-4bc5-4ae4-a022-2f353f89ca47.json) |
| Updated after restarting the publisher | Eight files; same owner, topic and manifest; feed index advanced from 0 to 1 | [Second publication](runs/97f43c4f-de5c-42b2-a037-9199bff687bd.json) |
| Recovered without the publisher or our Bee | Both services stopped, publisher state moved aside, all eight files verified through the public gateway | [Independent recovery](recovery/publisher-and-bee-offline.json) |
| Browser recovery | Reader loaded eight files with the publishing services offline; generated a ZIP; every contained file was independently checked | [ZIP verification](recovery/browser-zip.json) |
| Published through the hosted keeper | Third edition has nine records; same manifest; network index 2 | [Third publication](runs/8b989dc7-b78c-473e-84ad-bc2139e4ff9d.json) |
| Hosted authentication and chunking | Rejected anonymous/CSRF requests; transferred and checked a 5 MiB file through Vercel in 2 MiB requests | [Hosted API test](hosting/vercel-integration.json) |
| Hosted browser recovery | A public visitor downloaded a complete ZIP; every contained file was checked again outside the browser | [Hosted browser ZIP](hosting/browser-zip.json) |
| Repeated recovery after the hosted release | Nine files retrieved with the keeper and Bee stopped and state moved aside | [Hosted-release offline recovery](hosting/offline-recovery.json) |
| Downloaded a self-contained handoff reader | Extracted only the recovery-card ZIP, served it statically, and retrieved all nine records | [Recovery card](hosting/recovery-card.json) |
| Opened the simplified recovery card directly | Double-clicked its single HTML file; collection opened automatically; all nine downloaded files independently verified | [Single-file recovery](hosting/single-file-recovery.json) |
| Started and stopped the keeper on demand | One foreground command reconnected Vercel; a failed keeper restarted; Ctrl+C stopped every owned process and released both local ports | [Keeper lifecycle](hosting/on-demand-keeper.json) |
| Recovered from a copied Folio link after review | A local HTML reader accepted the hosted collection link and recovered all nine files with the local app and Bee off | [Post-review recovery](hosting/post-review-recovery.json) |
| Bought immutable postage | Approximately 102.49 MB effective capacity, initially seven days; quote 0.6571043271999488 xBZZ | [Purchase](storage/d892cb32-8716-4d5e-9010-c5c8fc658cc2.json) |
| Renewed original postage | Observed TTL increased from 604,288 to 1,209,038 seconds; quote 0.6572311629529088 xBZZ | [Renewal](storage/ef65d5fe-c524-4809-a225-8e367e757635.json) |
| Confirmed renewal on-chain | Successful Gnosis receipt; postage event includes the batch ID | [Transaction receipt](storage/transaction-8a3abaf6.json) |
| Funded network accounting | 0.1 xBZZ moved from the same node wallet into its chequebook; balance reread | [Deposit](node/chequebook-deposit.json) |

The publisher was restarted between editions. The second edition restored its editing draft from Swarm before adding two text records. Local state was restored and Bee restarted after the recovery test.

The ZIP report records when browser verification completed; the CLI offline report additionally records explicit endpoint-offline checks. The ZIP was checked after downloading, with every archived file's size and SHA-256 compared to its inventory. Recovery files and the ZIP remain ignored under `.runtime/recovered/`.

## Public identifiers

[Machine-readable descriptor](archives/77b9a322-61b9-40a1-b7a4-28aa35d6d0fd.json)

```text
Stable manifest:
ebabde0eebd602ef6e66ed4cfda2a78b62f2f2d589548a0d5e1a3d791761d0b5

First snapshot, feed index 0:
cd0e9205745f9278da35e71090d43c962d38b117e5d79de3c76a36937e26b88c

Second snapshot, feed index 1:
184f2e28fc0ea63fdb94b7ca3828052a649e027e399958d1f7cfca7dd63471e6

Third snapshot, feed index 2:
d0529544339a2ad8c215cd0e47e45429edb269735cc7628004a83479ed1e7151

Immutable postage batch:
c851f331b00d953d3173ef629637953b8d73018383c1c5f13388b347f2303e1e
```

Renewal transaction: [Gnosis explorer](https://gnosisscan.io/tx/0x8a3abaf6dff846ac5d62393ef3ba69b388dc40ded3c3f07225e704823a26af94). The SDK's storage methods return a **batch ID**, not a transaction hash; this chain receipt was separately retrieved and checked.

## Repeat the important check

From the repository root, with no local publisher or funded Bee required:

```bash
npm ci
npm run verify:archive -- \
  --descriptor evidence/archives/77b9a322-61b9-40a1-b7a4-28aa35d6d0fd.json
```

For a complete saved copy, use `npm run recover` instead and choose a new `--out .runtime/recovered/your-copy` directory. The verifier resolves the current feed, so future publications may produce a different snapshot and file count. A network error is not proof of checksum failure; the command reports the actual failure and exits nonzero.

## Limits of this evidence

- Direct HTML navigation at the shared public gateway currently redirects to a hash-approval page. **The independent reader and raw data retrieval work.** No hash-approval request was sent. The [contest entry was submitted separately](submission/loops.json) with the builder's approval.
- Storage TTL is an observed estimate, not guaranteed permanence. The third edition includes a post-renewal observation; every reader estimate is still labelled historical.
- The laptop does not provide continuous service while sleeping or shut down. The offline recovery test establishes retrieval through another endpoint at that moment.
- Synthetic tests cover corrupt files and feed race/failure cases; they are not presented as live outages deliberately induced on Swarm.
- The public app is https://folio-archive.vercel.app. Hosted API/browser results are recorded separately from the original local observations. A written walkthrough is not a video recording.
- No gift code, private signing key, node password or authenticated URL belongs in this directory.
