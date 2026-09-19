# One website, a persistent local keeper

The public deployment is https://folio-archive.vercel.app. The public reading room runs in the visitor’s browser and retrieves directly from a public Bee endpoint. It can recover while the keeper and its local Bee are stopped.

The keeper page at `/manage` is part of the same Next.js app. In Vercel mode, its API authenticates an owner session, checks origin and CSRF for writes, and proxies narrow application requests over HTTPS to the local app. It does not expose Bee’s API. A separate bridge secret authenticates every request to the keeper. Neither secret is sent in public page props, URLs, browser bundles, evidence, or Git. The separate public `/api/preservation` GET endpoint returns only an allowlisted node observation; it accepts no write or proxy target parameters and is cached for 30 seconds.

## Local setup

1. Configure and run Bee as described in [NODE.md](NODE.md).
2. Run `npm run hosting:setup`. It generates separate 256-bit owner and bridge keys, stores them in `.env.local` and `.runtime/hosting/` with private file permissions, and prints no secret.
3. Run `npm run build && npm start` on the keeper computer.
4. Establish an HTTPS tunnel to **127.0.0.1:3000**, not port 1633. For this demonstration an official Cloudflare binary is stored at `.runtime/hosting/bin/cloudflared`:

```bash
.runtime/hosting/bin/cloudflared tunnel \
  --url http://127.0.0.1:3000 --no-autoupdate \
  --logfile .runtime/hosting/tunnel.log
```

A quick tunnel has a new hostname after restart and no uptime guarantee. It is a demo connection, not a claim of continuous hosting. Use a stable named tunnel for ongoing operations. [Cloudflare’s quick-tunnel limitations](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).

## Vercel configuration

Use Node.js 22 and `npm run build` (configured in `vercel.json`). Set these **server-only** production environment variables:

| Variable | Value |
| --- | --- |
| `FOLIO_KEEPER_URL` | The HTTPS origin of the keeper tunnel; no credentials, path, query, or fragment |
| `FOLIO_BRIDGE_KEY` | Same bridge key as the local keeper; mark Secret |
| `FOLIO_OWNER_KEY` | Generated owner access key; mark Secret |

The app also recognises the Vercel platform environment and fails closed if configuration is missing. Do not set any of these as `NEXT_PUBLIC_` values. Do not point `BEE_URL` at the keeper’s loopback from Vercel.

The first local setup writes the owner’s login key to `.runtime/hosting/FOLIO_OWNER_KEY.txt`. Open that file locally when signing in; keep it out of chat, screenshots, recordings, and the repository. Rotating the owner key invalidates all old sessions. Bridge rotation must update both ends.

`.vercelignore` excludes `.runtime`, `.env.local`, Git metadata, caches, and credentials. `next.config.ts` also excludes private directories from function file tracing. Run `vercel deploy --dry --json` and the deployment secret scan before release when configuration changes.

## Why 2 MiB parts

Vercel Functions have a [4.5 MB request/response limit](https://vercel.com/docs/functions/limitations). Both upload and draft-download requests stay at or below 2 MiB. The keeper verifies exact part lengths, tolerates identical retries, checks the complete SHA-256, and adds a file only after verified atomic finalisation. A lost completion response can be retried without duplication. Abandoned transfers expire after 24 hours and are pruned when another upload starts.

Publishing returns a job ID immediately. The persistent local process performs the long upload/verification/feed append; Vercel only polls. Job state and the proposed snapshot are persisted. A restarted keeper marks interrupted work for explicit network reconciliation, without automatically repeating a signed write. Postage quotes expire and are single-use; if a payment response is lost, inspect the node and receipts before requesting another payment.

## Operations and testing

Keep the computer awake while publishing, renewing, or presenting the keeper view. A stopped keeper yields an explicit unavailable message; it does not prevent public archive retrieval. After restarting a quick tunnel, update `FOLIO_KEEPER_URL` and redeploy. The Vercel deployment itself remains online.

On the same keeper checkout, `node scripts/verify-hosting.mjs https://YOUR-DEPLOYMENT` checks authentication, CSRF, real Bee status, and a generated 5 MiB transfer. It removes only its own unpublished fixture and writes a public report; it never publishes or spends postage. This test expects the local `.runtime/hosting/FOLIO_OWNER_KEY.txt` to correspond to that deployment.

The successful actual run is [recorded here](../evidence/hosting/vercel-integration.json). It is separate from the offline recovery and feed-update evidence.
