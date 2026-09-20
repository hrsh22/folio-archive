# Deployment and access boundaries

Folio has one Next.js application and an independent, self-contained reader. The deployment is optional for repository verification: `npm test`, `npm run build`, and the public recovery verifier exercise the implementation directly.

## Public reading

`ReadingRoom` calls `resolveArchive`, which retrieves bootstrap metadata, resolves the signed feed and downloads the inventory from Swarm. File previews and complete downloads verify sizes and SHA-256 checksums. A featured address is a navigation hint, never a stored public inventory. The standalone recovery card includes its reader and needs no publisher account.

## Publishing authority

The keeper API owns draft mutations, storage operations and durable publication jobs. Hosted mutations require a signed owner session, same-origin checks and CSRF verification; the application gateway authenticates its upstream requests with a separate bridge credential. This boundary exposes narrow application actions rather than the Bee API. Public `/api/preservation` returns an explicit allowlist of timestamped node observations.

Server-only configuration is `FOLIO_KEEPER_URL` (an HTTPS origin without credentials, path, query or fragment), `FOLIO_BRIDGE_KEY` and `FOLIO_OWNER_KEY`. Missing configuration fails closed for private operations. None of these values uses a `NEXT_PUBLIC_` prefix or appears in public page props, evidence or Git.

## Deployment checks

`.vercelignore` excludes private runtime files, environment files, Git metadata and credentials. `next.config.ts` excludes private directories from function tracing. CI builds the application and runs the secret scan, access-control tests, feed tests, recovery tests and upload tests.

Recorded integration evidence in `evidence/hosting/` includes authenticated multipart upload, public recovery and standalone-card verification. These timestamped receipts describe completed observations, not a dependency on an interactive demonstration. Prepaid Swarm storage still needs renewal; availability and historical estimates are described in the product.
