# Demonstration walkthrough

Public entrypoint: **https://folio-archive.vercel.app**. Use the original, clearly synthetic collection. No viewer login is needed.

1. **Reading comes first.** Open the reading room, then the collection. Point out that the inventory comes from Swarm. Preview a folio and read the keeper’s note.
2. **A complete verified copy.** Choose “Download verified archive.” The browser checks every size and SHA-256 before producing a ZIP with its own recovery report.
3. **A handoff without the website.** Open “Save its recovery card.” Extract the ZIP and double-click **Open Folio.html**. The collection opens automatically from public Swarm identifiers, without a server or installation. Recover all nine records and inspect the verification report. The card grants read access, not publishing rights, and is not itself a backup of the files.
4. **A living archive at one address.** Open the previous edition. Compare the three publication receipts: the stable manifest stays the same; the snapshot and network-derived feed index advance. The third edition was published through the hosted keeper API.
5. **The disappearance test.** Press Ctrl+C in the keeper terminal to stop the tunnel, local app, and Bee. Reload the hosted collection and recover again, or open the saved HTML card. The earlier test also moved publisher state aside; its offline observations and per-file hashes are in `evidence/hosting/`. Run `npm run keeper:start` only when you need the keeper again.
6. **Real preservation work.** The keeper’s “Node & storage” view shows light mode, peers, version, batch and observed lifetime. The proof page and renewal receipt show a real extension. Do not present historical TTL as a fresh balance or promise of forever.
7. **Inspectable source.** Open the tracked descriptor, `feed-update.ts`, `tools/recover.ts`, tests and public evidence. Run the verifier from a fresh clone without local secrets.

```bash
npm run verify:archive -- --descriptor evidence/archives/77b9a322-61b9-40a1-b7a4-28aa35d6d0fd.json
npm test
```

A screen recording, if made, should show only public pages and evidence. Keep private configuration, owner login keys, terminal history, and gift material out of frame. This written walkthrough is not itself a video recording. Do not submit the contest project without the builder’s instruction.
