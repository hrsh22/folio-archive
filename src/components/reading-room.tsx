"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { displayText } from "@/lib/display-text";
import { useRouter } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  Copy,
  FileText,
  FolderOpen,
  History,
  KeyRound,
  LoaderCircle,
  Radio,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  archiveSchema,
  formatBytes,
  referenceFromInput,
  type ArchiveFile,
} from "@/lib/archive-format";
import { makeBee, resolveArchive, isMissingFeed } from "@/lib/network";
import {
  download,
  handoffZip,
  recoveryZip,
  verifiedBytes,
} from "@/lib/browser-recovery";
import { DEFAULT_GATEWAY, FEATURED_ARCHIVE } from "@/lib/public-archive";

type Resolved = Awaited<ReturnType<typeof resolveArchive>>;

function VerifiedImage({
  file,
  endpoint,
  snapshot,
  className = "",
  onVerified,
}: {
  file: ArchiveFile;
  endpoint: string;
  snapshot: string;
  className?: string;
  onVerified?: () => void;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => {
    let objectUrl = "",
      alive = true;
    const controller = new AbortController();
    setUrl("");
    setError(false);
    verifiedBytes(endpoint, snapshot, file, controller.signal)
      .then((bytes) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(
          new Blob([new Uint8Array(bytes)], { type: file.type }),
        );
        setUrl(objectUrl);
        onVerified?.();
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file, endpoint, snapshot]); // The callback only reports completion; it is not a network dependency.
  return url ? (
    <img className={className} src={url} alt={displayText(file.name)} />
  ) : (
    <div className={`image-placeholder ${className}`}>
      {error ? (
        <>
          <FileText size={22} />
          <span>Preview unavailable</span>
        </>
      ) : (
        <>
          <LoaderCircle size={19} className="spin" />
          <span>Checking image…</span>
        </>
      )}
    </div>
  );
}

export function ReadingRoom({ reference }: { reference?: string }) {
  const router = useRouter();
  const isHome = !reference;
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [endpoint, setEndpoint] = useState(DEFAULT_GATEWAY),
    [gatewayInput, setGatewayInput] = useState(DEFAULT_GATEWAY);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [input, setInput] = useState(""),
    [query, setQuery] = useState("");
  const [notice, setNotice] = useState(""),
    [addressOpen, setAddressOpen] = useState(false),
    [recoverOpen, setRecoverOpen] = useState(false);
  const [preview, setPreview] = useState<ArchiveFile | null>(null),
    [textPreview, setTextPreview] = useState("");
  const [busy, setBusy] = useState(""),
    [progress, setProgress] = useState(0),
    [complete, setComplete] = useState(false),
    [historical, setHistorical] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const cancel = useRef<AbortController | null>(null);
  const archive = resolved?.archive;
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    setResolved(null);
    setHistorical(false);
    setComplete(false);
    resolveArchive(reference || FEATURED_ARCHIVE, endpoint)
      .then((value) => {
        if (alive) setResolved(value);
      })
      .catch((e) => {
        if (alive)
          setError(
            isMissingFeed(e)
              ? "There is no retrievable edition at this address yet. The keeper may not have published its first edition, or the endpoint may be unavailable. Retry or try another Bee endpoint."
              : "The archive could not be read from this endpoint. Retry, check its address, or try another public Bee endpoint.",
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      cancel.current?.abort();
    };
  }, [reference, endpoint, attempt]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 8000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    setTextPreview("");
    if (
      !preview ||
      !resolved ||
      !/^(text\/|application\/json)/.test(preview.type)
    )
      return;
    const controller = new AbortController();
    verifiedBytes(endpoint, resolved.snapshot, preview, controller.signal)
      .then((bytes) =>
        setTextPreview(new TextDecoder().decode(bytes.slice(0, 100000))),
      )
      .catch((e) => {
        if (!controller.signal.aborted) setNotice((e as Error).message);
      });
    return () => controller.abort();
  }, [preview, resolved, endpoint]);
  async function work(label: string, action: () => Promise<void>) {
    setBusy(label);
    setProgress(0);
    try {
      await action();
    } catch (e) {
      setNotice(
        (e as Error).name === "AbortError"
          ? "Recovery cancelled. No complete archive was produced."
          : (e as Error).message,
      );
    } finally {
      setBusy("");
      cancel.current = null;
    }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Copied. Keep this address somewhere safe.");
    } catch {
      setAddressOpen(true);
    }
  }
  function openArchive() {
    try {
      const ref = referenceFromInput(input);
      setRecoverOpen(false);
      router.push(`/archive/${ref}`);
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  const totalBytes = archive?.files.reduce((n, f) => n + f.size, 0) || 0;
  const observedDays = archive
    ? Math.max(
        0,
        (archive.storage.remainingSeconds -
          (Date.now() - Date.parse(archive.storage.observedAt)) / 1000) /
          86400,
      )
    : 0;
  const files =
    archive?.files.filter((f) =>
      displayText(`${f.name} ${f.caption} ${f.source}`)
        .toLowerCase()
        .includes(displayText(query).toLowerCase()),
    ) || [];

  return (
    <div className="reading-room">
      <header className="reading-nav">
        <Link href="/" className="wordmark" aria-label="Folio reading room">
          <span className="brand-mark">
            <i />
            <i />
            <i />
          </span>
          folio<span className="brand-period">.</span>
        </Link>
        <nav aria-label="Reading room navigation">
          <Link href="/" className={isHome ? "selected" : ""}>
            Reading room
          </Link>
          <button onClick={() => setRecoverOpen(true)}>Open an archive</button>
          <Link href="/proof">The proof</Link>
        </nav>
        <Link href="/manage" className="keeper-link">
          <KeyRound size={14} />
          <span>Keeper’s desk</span>
          <ArrowUpRight size={14} />
        </Link>
      </header>
      <main className="reading-main">
        {isHome ? (
          <section className="reading-hero">
            <div>
              <p className="eyebrow">
                <span /> A READING ROOM WITHOUT A LANDLORD
              </p>
              <h1>
                Good stories deserve
                <br />a <em>longer life.</em>
              </h1>
              <p className="reading-lede">
                An archive should outlive the person who keeps it.
                <br />
                Read, verify, and take a copy from the Swarm network.
                <br />
                No account. No permission from the keeper.
              </p>
              <div className="hero-actions">
                <Button asChild>
                  <Link href={`/archive/${FEATURED_ARCHIVE}`}>
                    Explore the collection <ArrowRight size={16} />
                  </Link>
                </Button>
                <button
                  className="text-button"
                  onClick={() => setRecoverOpen(true)}
                >
                  Have an archive address? <ArrowUpRight size={14} />
                </button>
              </div>
              <div className="reading-signature">
                <span className="tiny-cross">✳</span>
                <span>
                  Kept with care.
                  <br />
                  <em>Carried forward, together.</em>
                </span>
              </div>
            </div>
            <div
              className="reading-art"
              aria-label="Original synthetic folio studies"
            >
              <div className="reading-art-label">
                FROM THE SPITI STUDY COLLECTION / 01
              </div>
              <img
                src="/samples/folio-2.svg"
                className="reading-paper-back"
                alt="Indigo synthetic folio illustration"
              />
              <img
                src="/samples/folio-1.svg"
                className="reading-paper-front"
                alt="Ochre synthetic folio illustration"
              />
              <span className="reading-art-number">VIII</span>
              <span className="reading-art-note">
                A small beginning.
                <br />
                An open future.
              </span>
            </div>
          </section>
        ) : (
          <Link className="text-button reader-back" href="/">
            <ArrowLeft size={15} /> The reading room
          </Link>
        )}
        <section
          className="network-strip"
          aria-label="Source of archive contents"
        >
          <span>
            <Radio size={15} />
            {loading
              ? "Reading from Swarm…"
              : error
                ? "Network read needs attention"
                : "Inventory retrieved from Swarm"}
          </span>
          <span>
            PUBLIC READ ACCESS <i /> NO PUBLISHER REQUIRED
          </span>
        </section>
        {loading && (
          <div className="reading-loading" role="status">
            <LoaderCircle className="spin" />
            <h2>Following the archive’s address…</h2>
            <p>Discovering its latest edition on the network.</p>
          </div>
        )}
        {error && (
          <div className="reading-empty" role="alert">
            <FolderOpen size={28} />
            <h2>Let’s find that collection.</h2>
            <p>{displayText(error)}</p>
            <div className="hero-actions">
              <Button onClick={() => setAttempt((v) => v + 1)}>
                Retry network read
              </Button>
              <Button variant="outline" onClick={() => setRecoverOpen(true)}>
                Change endpoint or address
              </Button>
            </div>
          </div>
        )}
        {resolved &&
          archive &&
          (isHome ? (
            <section className="featured-archive">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">AN OPEN COLLECTION</p>
                  <h2>On the reading table</h2>
                </div>
                <span className="catalogue-number">COLLECTION NO. 001</span>
              </div>
              <Link
                className="featured-card"
                href={`/archive/${resolved.descriptor.manifestReference}`}
              >
                <div className="featured-images">
                  {archive.files
                    .filter((f) => f.type.startsWith("image/"))
                    .slice(0, 3)
                    .map((file) => (
                      <VerifiedImage
                        key={file.id}
                        file={file}
                        endpoint={endpoint}
                        snapshot={resolved.snapshot}
                      />
                    ))}
                </div>
                <div className="featured-copy">
                  <span className="collection-tag">
                    ORIGINAL DEMONSTRATION COLLECTION
                  </span>
                  <h3>{displayText(archive.title)}</h3>
                  <p>{displayText(archive.description)}</p>
                  <div className="featured-bottom">
                    <span>
                      {archive.files.length} items <i />{" "}
                      {formatBytes(totalBytes)}
                    </span>
                    <span>
                      Read the collection <ArrowUpRight size={18} />
                    </span>
                  </div>
                </div>
              </Link>
            </section>
          ) : (
            <>
              <section className="archive-heading">
                <div>
                  <p className="eyebrow">
                    {historical
                      ? "FROM THE ARCHIVE’S HISTORY"
                      : "THE LATEST PUBLISHED EDITION"}
                  </p>
                  <h1>{displayText(archive.title)}</h1>
                  <p className="archive-description">
                    {displayText(archive.description)}
                  </p>
                  <div className="edition-meta">
                    <span>{archive.files.length} items</span>
                    <i />
                    <span>{formatBytes(totalBytes)}</span>
                    <i />
                    <span>
                      Published{" "}
                      {new Date(archive.publishedAt).toLocaleDateString(
                        "en-GB",
                        { day: "numeric", month: "long", year: "numeric" },
                      )}
                    </span>
                  </div>
                </div>
                <div className="archive-actions">
                  <Button
                    disabled={!!busy}
                    onClick={() =>
                      work("Recovering the collection", async () => {
                        cancel.current = new AbortController();
                        setComplete(false);
                        const result = await recoveryZip(
                          resolved,
                          endpoint,
                          (done, total) => setProgress((done / total) * 100),
                          cancel.current.signal,
                        );
                        download(
                          result.bytes,
                          `folio-${archive.archiveId}.zip`,
                          "application/zip",
                        );
                        setComplete(true);
                        setNotice(
                          `All ${archive.files.length} files verified. Your archive includes a recovery report.`,
                        );
                      })
                    }
                  >
                    <ArrowDownToLine size={17} /> Download verified archive
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setAddressOpen(true)}
                  >
                    <BookOpen size={16} /> Save its recovery card
                  </Button>
                  <button
                    className="text-button"
                    onClick={() =>
                      copy(
                        `${location.origin}/archive/${resolved.descriptor.manifestReference}`,
                      )
                    }
                  >
                    <Copy size={14} /> Copy collection link
                  </button>
                </div>
              </section>
              <div className="preservation-note">
                <ShieldCheck size={21} />
                <div>
                  <strong>
                    {complete
                      ? "Every file verified in this browser."
                      : "An address that follows the collection."}
                  </strong>
                  <p>
                    New editions keep the same public address. Downloads check
                    every file’s checksum before creating your copy.
                  </p>
                </div>
                <span>
                  {observedDays > 0
                    ? `≈ ${observedDays.toFixed(1)} days`
                    : "Check funding"}
                  <small>estimated storage remaining*</small>
                </span>
              </div>
              {busy && (
                <div className="recovery-progress" role="status">
                  <span>
                    <LoaderCircle size={17} className="spin" />{" "}
                    {displayText(busy)}
                  </span>
                  <Progress value={progress} />
                  {cancel.current && (
                    <button
                      className="text-button"
                      onClick={() => cancel.current?.abort()}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              )}
              <div className="archive-toolbar">
                <div className="section-heading">
                  <h2>
                    Inside the collection <span>{archive.files.length}</span>
                  </h2>
                </div>
                <div className="archive-toolbar-actions">
                  <label className="reader-search">
                    <Search size={16} />
                    <input
                      aria-label="Search files"
                      placeholder="Find an item…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  {archive.previousSnapshot && (
                    <button
                      className="text-button"
                      disabled={!!busy}
                      onClick={() =>
                        work("Reading the previous edition", async () => {
                          const snapshot = archive.previousSnapshot!;
                          const data = await makeBee(endpoint).file.download(
                            snapshot,
                            "archive.json",
                          );
                          if (data.data.length > 1024 * 1024)
                            throw new Error("Inventory too large.");
                          const previous = archiveSchema.parse(
                            data.data.toJSON(),
                          );
                          if (previous.archiveId !== archive.archiveId)
                            throw new Error("Edition identity does not match.");
                          setResolved({
                            ...resolved,
                            archive: previous,
                            snapshot,
                            feedIndex: "historical-snapshot",
                          });
                          setHistorical(true);
                          setComplete(false);
                        })
                      }
                    >
                      <History size={15} /> Previous edition
                    </button>
                  )}
                  {historical && (
                    <button
                      className="text-button"
                      onClick={() => setAttempt((v) => v + 1)}
                    >
                      Back to latest
                    </button>
                  )}
                </div>
              </div>
              <div className="reading-grid">
                {files.map((file, i) => (
                  <button
                    className="reading-file"
                    key={`${resolved.snapshot}:${file.id}`}
                    onClick={() => setPreview(file)}
                  >
                    <div className="reading-file-art">
                      {file.type.startsWith("image/") ? (
                        <VerifiedImage
                          file={file}
                          endpoint={endpoint}
                          snapshot={resolved.snapshot}
                        />
                      ) : (
                        <div className="text-file-art">
                          <FileText size={34} strokeWidth={1} />
                          <span>
                            {file.type.includes("json")
                              ? "PROVENANCE"
                              : "A NOTE FROM THE KEEPER"}
                          </span>
                        </div>
                      )}
                      <span className="file-open">
                        <ArrowUpRight size={17} />
                      </span>
                    </div>
                    <div className="reading-file-caption">
                      <span>{String(i + 1).padStart(2, "0")}</span>
                      <div>
                        <h3>{displayText(file.name)}</h3>
                        <p>
                          {displayText(file.caption) ||
                            `${formatBytes(file.size)} · ${file.type.split("/").pop()}`}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              {!files.length && (
                <div className="reading-empty">
                  <Search size={24} />
                  <p>No items match “{query}”.</p>
                </div>
              )}
              <p className="storage-footnote">
                * Derived from the node’s observed postage lifetime on{" "}
                {new Date(archive.storage.observedAt).toLocaleString()}. This is
                an estimate, not a fresh balance or a promise of permanence.
                Renewals and network pricing can change it. Keep a verified copy
                of anything irreplaceable.
              </p>
            </>
          ))}
        <section className="reading-principles">
          <div>
            <span>01 / AN OPEN ADDRESS</span>
            <h3>
              The keeper can leave.
              <br />
              The address stays.
            </h3>
            <p>
              One public feed follows each new edition. Save its recovery card
              with someone you trust.
            </p>
          </div>
          <div>
            <span>02 / A COPY YOU CAN TRUST</span>
            <h3>
              Every file checked.
              <br />
              Every story intact.
            </h3>
            <p>
              Recovery discovers the inventory from Swarm, checks SHA-256
              fingerprints, and packages a complete copy.
            </p>
          </div>
          <div>
            <span>03 / CARE, NOT MAGIC</span>
            <h3>
              Preservation takes
              <br />a little tending.
            </h3>
            <p>
              Storage is prepaid and renewable. Folio shows its observed
              lifetime, because “forever” needs more than a promise.
            </p>
          </div>
        </section>
        <footer className="reading-footer">
          <span>
            folio. <em>An archive beyond its keeper.</em>
          </span>
          <div>
            <Link href="/proof">
              How this was verified <ArrowUpRight size={13} />
            </Link>
            <span>BUILT ON SWARM ⠿</span>
          </div>
        </footer>
      </main>
      {notice && (
        <div className="toast reader-toast" role="status">
          <ShieldCheck size={18} />
          <span>{displayText(notice)}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      <Dialog open={recoverOpen} onOpenChange={setRecoverOpen}>
        <DialogContent className="reader-dialog">
          <DialogHeader>
            <DialogTitle>Open an archive</DialogTitle>
            <DialogDescription>
              Bring a public archive address. Its contents are read directly
              from Swarm; no keeper account is needed.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              openArchive();
            }}
          >
            <Label htmlFor="archive-address">
              Collection link or stable manifest
            </Label>
            <Input
              id="archive-address"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste an archive link or address"
              required
            />
            <Button type="submit">
              Open collection <ArrowRight size={15} />
            </Button>
          </form>
          <details>
            <summary>Change the public Bee endpoint</summary>
            <Label htmlFor="bee-endpoint">
              HTTP(S) endpoint without credentials
            </Label>
            <Input
              id="bee-endpoint"
              type="url"
              value={gatewayInput}
              onChange={(e) => setGatewayInput(e.target.value)}
            />
            <Button
              variant="outline"
              onClick={() => {
                try {
                  makeBee(gatewayInput);
                  setEndpoint(gatewayInput.replace(/\/$/, ""));
                  setRecoverOpen(false);
                  setAttempt((v) => v + 1);
                } catch (e) {
                  setNotice((e as Error).message);
                }
              }}
            >
              Use this endpoint
            </Button>
            <small>
              The endpoint must allow browser requests. It receives the public
              archive address.
            </small>
          </details>
        </DialogContent>
      </Dialog>
      <Dialog open={addressOpen} onOpenChange={setAddressOpen}>
        <DialogContent className="reader-dialog recovery-card-dialog">
          <DialogHeader>
            <p className="eyebrow">KEEP THIS SOMEWHERE ELSE</p>
            <DialogTitle>A way back to the story.</DialogTitle>
            <DialogDescription>
              Unzip the card and double-click Open Folio.html. Your collection
              opens automatically in your browser, even if this website
              disappears.
            </DialogDescription>
          </DialogHeader>
          {resolved && (
            <>
              <Label>Your archive address</Label>
              <code className="public-identifier">
                {resolved.descriptor.manifestReference}
              </code>
              <details>
                <summary>Technical details for another reader</summary>
                <Label>Feed owner</Label>
                <code className="public-identifier">
                  {resolved.descriptor.owner}
                </code>
                <Label>Feed topic</Label>
                <code className="public-identifier">
                  {resolved.descriptor.topic}
                </code>
              </details>
              <Button
                disabled={!!busy}
                onClick={() =>
                  work("Packing the recovery card", async () => {
                    download(
                      await handoffZip(resolved.descriptor, endpoint),
                      `folio-recovery-card-${resolved.descriptor.archiveId}.zip`,
                      "application/zip",
                    );
                    setNotice(
                      "Recovery card saved. Unzip it, then double-click Open Folio.html.",
                    );
                  })
                }
              >
                <ArrowDownToLine size={16} /> Download card & independent reader
              </Button>
              <Button
                variant="outline"
                onClick={() => copy(resolved.descriptor.manifestReference)}
              >
                <Copy size={14} /> Copy archive address
              </Button>
              <p className="dialog-note">
                This grants read access. Publishing rights stay with the keeper.
                Availability still depends on funded storage and the network.
              </p>
              <div className="publication-disclosure">
                <strong>
                  Moving institutions or handing over the collection?
                </strong>
                <p>
                  Give the next custodian this card and a verified archive
                  download. Ask them to open the card on another computer and
                  check every file before you lose access to the old account.
                </p>
                <p>
                  Agree who will monitor and renew storage. The card contains no
                  signing key and does not transfer the ability to publish new
                  editions. Keep any publishing credentials in a separate
                  private handover.
                </p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!preview} onOpenChange={() => setPreview(null)}>
        <DialogContent className="preview-dialog">
          <DialogHeader>
            <DialogTitle>{displayText(preview?.name)}</DialogTitle>
            <DialogDescription>
              {preview &&
                `${formatBytes(preview.size)} · ${preview.type} · retrieved from Swarm`}
            </DialogDescription>
          </DialogHeader>
          {preview && resolved && (
            <>
              {preview.type.startsWith("image/") ? (
                <VerifiedImage
                  file={preview}
                  endpoint={endpoint}
                  snapshot={resolved.snapshot}
                  className="preview-image"
                />
              ) : /^(text\/|application\/json)/.test(preview.type) ? (
                <pre className="reader-text-preview">
                  {displayText(textPreview) || "Retrieving and verifying…"}
                </pre>
              ) : (
                <div className="document-preview">
                  <FileText size={38} />
                  <p>
                    Download this item to open it in a compatible application.
                  </p>
                </div>
              )}
              <Button
                disabled={!!busy}
                onClick={() =>
                  work("Verifying this file", async () => {
                    download(
                      await verifiedBytes(endpoint, resolved.snapshot, preview),
                      preview.name,
                      preview.type,
                    );
                    setNotice("Checksum verified. File downloaded.");
                  })
                }
              >
                <ArrowDownToLine size={16} /> Download verified file
              </Button>
              {preview.source && (
                <p className="dialog-note">
                  Source: {displayText(preview.source)}
                </p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
