# One website, an on-demand local keeper

The public deployment is https://folio-archive.vercel.app. The public reading room runs in the visitor’s browser and retrieves directly from a public Bee endpoint. It can recover while the keeper and its local Bee are stopped.

The keeper page at `/manage` is part of the same Next.js app. In Vercel mode, its API authenticates an owner session, checks origin and CSRF for writes, and proxies narrow application requests over HTTPS to the local app. It does not expose Bee’s API. A separate bridge secret authenticates every request to the keeper. Neither secret is sent in public page props, URLs, browser bundles, evidence, or Git. The separate public `/api/preservation` GET endpoint returns only an allowlisted node observation; it accepts no write or proxy target parameters and is cached for 30 seconds.

## Local setup

1. Install and configure Bee as described in [NODE.md](NODE.md). Stop any separately running Bee or Next.js process before using the combined command below.
2. Run `npm run hosting:setup`. It generates separate 256-bit owner and bridge keys, stores them in `.env.local` and `.runtime/hosting/` with private file permissions, and prints no secret.
3. Keep the official Cloudflare `cloudflared` binary at `.runtime/hosting/bin/cloudflared`. This checkout already has it. For another machine, use the correct platform asset from [Cloudflare's releases](https://github.com/cloudflare/cloudflared/releases) and verify its published checksum.
4. Configure the Vercel project and server-only secrets below, link this checkout, and sign in to the Vercel CLI. Run `npm run build` after installing or changing the app.
5. Start the connection whenever you need it:

```bash
npm run keeper:start
```

This runs Bee, Next.js, and a Cloudflare quick tunnel in the foreground. Leave that terminal open. **Ctrl+C stops all three.** Closing the terminal also requests shutdown. There is no login service, background daemon, or sleep prevention. You choose when the connection runs. The tunnel points to **127.0.0.1:3000**, never directly to Bee's port 1633.

The command connects each new tunnel hostname to the existing Vercel production app automatically. It uses the owner's existing Vercel CLI login to update `FOLIO_KEEPER_URL` and redeploy the **already published source**, without uploading local edits. Allow a few minutes for that deployment; the terminal prints `Connected` when it finishes. The public reading room keeps working during reconnection. A fresh checkout defaults to `https://folio-archive.vercel.app`; change `appUrl` in `.runtime/services/settings.json` for a different deployment.

While the command runs, a crashed child process is restarted and a changed tunnel address is reconnected. A quick tunnel still has no uptime guarantee. Sleep, terminal closure, power loss, or network loss can disconnect the keeper. [Cloudflare's quick-tunnel limitations](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).

Check the session from another terminal with `npm run keeper:status`. Rotating logs and status stay in `.runtime/services/`; the Vercel CLI cache stays in `.runtime/npm-cache/`. If reconnection reports an authentication error, sign in to the Vercel CLI again and restart the command. The command never funds postage or publishes an archive.

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

Run `npm run keeper:start` while publishing, renewing, or presenting the keeper view. Allow Bee to become ready and the tunnel deployment to finish before using those actions. Stop with Ctrl+C afterward. A stopped keeper yields an explicit unavailable message; it does not prevent public archive retrieval. The Vercel deployment itself remains online. The command does not change the computer's sleep settings.

On the same keeper checkout, `node scripts/verify-hosting.mjs https://YOUR-DEPLOYMENT` checks authentication, CSRF, real Bee status, and a generated 5 MiB transfer. It removes only its own unpublished fixture and writes a public report; it never publishes or spends postage. This test expects the local `.runtime/hosting/FOLIO_OWNER_KEY.txt` to correspond to that deployment.

The successful actual run is [recorded here](../evidence/hosting/vercel-integration.json). The [on-demand lifecycle check](../evidence/hosting/on-demand-keeper.json) separately records automatic Vercel reconnection, an isolated keeper restart, and Ctrl+C shutting down every owned process. These are separate from the offline recovery and feed-update evidence.
