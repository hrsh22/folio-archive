# Operating the local Bee node

All project-managed files stay under this repository directory. Bee is pinned to 2.8.2; its binary download is checked against the official release digest.

## Start, fund, check

```bash
npm run bee:install
npm run bee:start
```

With no `BEE_BLOCKCHAIN_RPC_ENDPOINT`, the node is read-only ultra-light. Set a Gnosis chain RPC in ignored `.env.local`, fund the existing node wallet and restart Bee. The observed chain ID must be 100. The development machine used `https://xdai.fairdatasociety.org`; RPC availability can change.

The event gift helper reads the gift at a hidden terminal prompt and invokes the pinned local `swarm-cli` utility. Review its public destination and balances before confirming:

```bash
npm run bee:fund
```

Never put gift material into source, command history, environment examples, screenshots or receipts. The helper does not write it to the repo. A gift already swept to this node does not need redeeming again.

```bash
npm run bee:status
```

Expected upload-capable state: `beeMode: light`, compatible API, completed readiness and usable immutable postage. The first light startup deploys a chequebook and synchronises postage; this can take several minutes. Confirm the returned wallet is the expected one before any funding.

## Storage on this computer

The launcher sets a cache capacity of **250,000 chunks** (roughly 1 GB of chunk payload). This is a target for the Bee cache, not a hard limit on total disk use. Databases, indexes, uploads, pinned chunks and logs can add space. It is a light node, not a full network storage node.

Measure actual project data:

```bash
du -sh .runtime/bee/data .runtime/folio
```

The initial observed node directory was only a few MB. Allow several GB of headroom as it is used. `node_modules` and `.runtime/npm-cache` are development tools and package cache, separate from Bee data.

## Stop and restart

Press Ctrl+C in the terminal running Bee and let it exit cleanly. Run `npm run bee:start` again to reopen the same data and identity. Restarting does not create another wallet. The API binds only to `127.0.0.1:1633`; P2P uses port 1634.

The local publisher is a separate process. Stop it with Ctrl+C; run `npm start` after a production build. The reader can continue to retrieve through a public gateway with both processes stopped.

## Private backup

Stop writes and Bee first. Back up `.runtime/bee/`, `.runtime/folio/keys/`, and any unpublished drafts securely. These contain the node's encrypted identity, its password and separate feed signing keys. Do not put the backup in Git or an evidence export. On restore, preserve restrictive file permissions and restart from the same project configuration.

Deleting local drafts after publication does not delete the Swarm collection. Losing all copies of the signing key prevents future feed updates, so public recoverability and publisher custody are separate responsibilities.

## Maintain the postage

The publisher quotes costs in xBZZ and obtains TTL/capacity from Bee. Confirming a quote spends the node wallet's funds; Gnosis gas is additional. An estimate expires after two minutes and is single-use. Failed or timed-out transactions must be inspected before buying another batch.

Renew the archive's **original** immutable batch. A new batch does not extend chunks stamped by an older batch. Renewal receipts include before/after node observations. The SDK returns a batch ID, not a transaction hash; separately captured chain receipts document the live demonstration transaction. Postage pricing can change; the UI avoids a fixed guaranteed expiry.
