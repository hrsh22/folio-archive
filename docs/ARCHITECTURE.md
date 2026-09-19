# Archive format and failure behavior

The authoritative collection is an immutable Swarm directory. Folio's mutable public address is a feed manifest. Each feed update contains exactly one snapshot reference; the payload is not the archive itself.

## Public files

`bootstrap.json` is a `folio.archive-address` version 1 descriptor containing `archiveId`, feed `owner`, feed `topic`, and `manifestReference`. Creating the feed manifest before the initial snapshot avoids circular content hashes. The real descriptor is also tracked under `evidence/archives/`.

`archive.json` is `folio.archive` version 1. It includes the title, description, archive ID, timestamp, previous snapshot, a dated postage observation and an explicit list of all recoverable files. File records include a unique ID, safe `files/` path, original name, MIME type, byte size, SHA-256 checksum, caption and source.

`index.html`, `style.css` and `app.js` are the standalone reader. `files/` contains the original bytes. The reader assets are infrastructure; the collection inventory lists the archivist's recoverable documents.

The formal schema is in `src/lib/archive-format.ts`. Paths reject traversal, absolute paths, backslashes, control characters, colons and empty segments. Inventories reject duplicate IDs, case-insensitive duplicate paths and oversized collections.

## Read path

1. Parse the public manifest reference.
2. Download its `bootstrap.json` through a selected endpoint.
3. Validate the bootstrap's manifest and archive identity.
4. Resolve the latest feed reference using pinned bee-js 13.1.0. Bee's raw feed response is binary, so the browser uses the SDK decoder too.
5. Read `archive.json` from that immutable snapshot.
6. Retrieve all listed files from the same snapshot and validate size and SHA-256.

No publisher module, local catalogue, credential, local feed counter or signing key participates in the independent recovery command. The browser reader has no publisher API calls. Changing the feed while recovery runs does not change the selected snapshot.

## Write path

The local service signs with a distinct per-archive feed key. It stages complete directory snapshots, uploads with `deferred: false`, and independently retrieves the new inventory and files before updating the feed. It serialises publication and freezes edits to the active draft.

Immediately before writing, `appendReference` reads the feed again and uses the returned `feedIndexNext`. It refuses a concurrent unexpected version. Only a 404 for an archive with no previous publication enables index zero. A timeout after sending is reconciled by rereading the network before reporting failure.

This prevents local restart counters and partial uploads from corrupting the normal publication sequence. It is not a distributed lock against two independent machines using the same signing key. Operate one publisher for each archive.

## Failure behavior

- Node unavailable or postage not usable: publication cannot begin.
- Snapshot upload or independent checksum check fails: the feed remains at the previous version.
- Feed write has an ambiguous response: check the current reference before reporting failure.
- Feed was updated but the final independent read fails: report the uncertainty, retain the public descriptor, and let the keeper restore the network version before further changes.
- Process crash: durable jobs are marked interrupted on restart. A pending record contains the exact proposed snapshot before any feed write. Reconciliation reads the public feed and re-verifies all files; it never signs again. A lock with a recorded dead PID can be reclaimed, while a live or unknown owner blocks a second writer.
- Missing/corrupt file during recovery: abort with an explicit incomplete result. The browser emits no complete ZIP; the CLI does not rename its incomplete directory to `complete`.
- Reader storage information: historical at publication time. Only the node-backed publisher claims a live TTL observation.

## Local trust boundary

The API binds to loopback. Local access validates loopback host/origin and same port, rejects cross-site requests, and requires a process-local token for mutations. Next may normalise a 127.0.0.1 request to localhost; both aliases are accepted on the same protocol/port.

Remote keeper calls additionally require the server-only bridge key. On Vercel, every keeper route requires a signed, expiring, HttpOnly owner cookie; writes also validate origin and a session-derived CSRF token. The proxy supplies the bridge secret server-side. It replaces the keeper's local mutation token with the hosted session's CSRF value and never sends the bridge key to a browser. Public archive readers call neither API.

The persistent local app owns all disk writes and long jobs. The cloud function only authenticates and proxies. Files travel in bounded 2 MiB parts in both directions, with idempotent retries, final SHA-256 verification and atomic inventory updates. Read [hosting details](HOSTING.md) for deployment and tunnel limitations.

Node and publisher secrets stay in ignored `.runtime/` with restrictive permissions. Evidence uses an explicit public-field allowlist. Public snapshots contain the reader, archive inventory and documents, never local staging metadata or private keys.
