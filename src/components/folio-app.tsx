"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { download, sha256 } from "@/lib/browser-recovery";
import { KeeperImage, readKeeperFile } from "./keeper-file";
import { referenceFromInput, MAX_FILE_BYTES } from "@/lib/archive-format";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Copy,
  Database,
  FileText,
  FolderOpen,
  HardDrive,
  Layers,
  Leaf,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  Radio,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  formatBytes,
  type Draft,
  type NodeStatus,
  type PublishedArchive,
  type PublishJob,
} from "@/lib/archive-format";

type View = "library" | "storage" | "recovery" | "evidence";
type Workspace = {
  drafts: Draft[];
  published: PublishedArchive[];
  session: string;
  jobs?: PublishJob[];
};
type Quote = {
  id: string;
  action: string;
  bzz: string;
  days: number;
  expiresAt: string;
  note: string;
};
const sections = [
  { id: "library", label: "My collections", icon: BookOpen },
  { id: "storage", label: "Node & storage", icon: HardDrive },
  { id: "recovery", label: "Recover an archive", icon: ArrowDownToLine },
  { id: "evidence", label: "Verification", icon: ShieldCheck },
] as const;

export function FolioApp() {
  const [workspace, setWorkspace] = useState<Workspace>({
    drafts: [],
    published: [],
    session: "",
  });
  const [node, setNode] = useState<NodeStatus | null>(null);
  const [view, setView] = useState<View>("library");
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{
    text: string;
    error?: boolean;
  } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [publishOpen, setPublishOpen] = useState(false);
  const [batchId, setBatchId] = useState("");
  const [job, setJob] = useState<PublishJob | null>(null);
  const [preview, setPreview] = useState<Draft["files"][number] | null>(null);
  const [archiveInput, setArchiveInput] = useState("");
  const [days, setDays] = useState(7);
  const [quote, setQuote] = useState<Quote | null>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  const draft = workspace.drafts.find((d) => d.id === selected);
  const published = workspace.published.find((a) => a.id === selected);
  const usableBatches =
    node?.batches.filter(
      (b) =>
        b.usable && b.immutable && (!published || b.id === published.batchId),
    ) || [];
  const batch = usableBatches[0];

  const refresh = useCallback(async () => {
    const response = await fetch("/api/state", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    setWorkspace(result);
    const newest = new Map<string, PublishJob>();
    for (const value of (result.jobs || []).slice().reverse() as PublishJob[]) {
      if (!newest.has(value.draftId)) newest.set(value.draftId, value);
    }
    const interrupted = [...newest.values()].find(
      (j) => j.status === "running" || j.status === "failed",
    );
    if (interrupted) setJob((current) => current || interrupted);
  }, []);
  const refreshNode = useCallback(async () => {
    try {
      const r = await fetch("/api/node", { cache: "no-store" });
      if (r.ok) {
        setNode(await r.json());
        return;
      }
    } catch {}
    setNode(null);
  }, []);
  useEffect(() => {
    refresh()
      .catch((e) => setNotice({ text: e.message, error: true }))
      .finally(() => setLoading(false));
    refreshNode();
    const interval = setInterval(refreshNode, 15000);
    return () => clearInterval(interval);
  }, [refresh, refreshNode]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 9000);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    if (!job || job.status !== "running") return;
    const interval = setInterval(async () => {
      try {
        const r = await fetch(`/api/jobs/${job.id}`);
        const value = await r.json();
        if (!r.ok) throw new Error(value.error);
        setJob(value);
        if (value.status === "complete") {
          refresh();
          refreshNode();
        }
      } catch (e) {
        setNotice({ text: (e as Error).message, error: true });
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [job, refresh, refreshNode]);

  async function api(url: string, method = "POST", body?: unknown) {
    const form = body instanceof FormData;
    const r = await fetch(`/api/${url}`, {
      method,
      headers: {
        "x-folio-session": workspace.session,
        ...(!form ? { "Content-Type": "application/json" } : {}),
      },
      body: form ? body : body === undefined ? undefined : JSON.stringify(body),
    });
    const value = await r.json();
    if (!r.ok) throw new Error(value.error || "The request failed.");
    return value;
  }
  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    try {
      await action();
    } catch (e) {
      setNotice({ text: (e as Error).message, error: true });
    } finally {
      setBusy("");
    }
  }
  function navigate(next: View) {
    setView(next);
    setSelected(null);
    setQuery("");
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice({ text: "Copied to clipboard." });
    } catch {
      setNotice({
        text: "Your browser could not copy this address.",
        error: true,
      });
    }
  }
  function openReader(reference = "") {
    window.open(
      reference ? `/archive/${referenceFromInput(reference)}` : "/",
      "_blank",
      "noopener,noreferrer",
    );
  }
  function create() {
    setTitle("");
    setDescription("");
    setCreateOpen(true);
  }
  async function upload(files: FileList | null) {
    if (!files?.length || !draft) return;
    await run("Adding files", async () => {
      for (const file of Array.from(files)) {
        if (file.size > MAX_FILE_BYTES)
          throw new Error(`${file.name} exceeds the 25 MB file limit.`);
        setBusy(`Checking ${file.name}`);
        const checksum = await sha256(new Uint8Array(await file.arrayBuffer()));
        const transfer = await api(`drafts/${draft.id}/uploads`, "POST", {
          name: file.name,
          type: file.type,
          size: file.size,
          sha256: checksum,
        });
        try {
          for (
            let part = 0;
            part < Math.max(1, Math.ceil(file.size / transfer.chunkBytes));
            part++
          ) {
            setBusy(
              `Adding ${file.name} · part ${part + 1} of ${Math.max(1, Math.ceil(file.size / transfer.chunkBytes))}`,
            );
            let succeeded = false;
            for (let attempt = 0; attempt < 3; attempt++) {
              const r = await fetch(
                `/api/drafts/${draft.id}/uploads/${transfer.id}/${part}`,
                {
                  method: "PUT",
                  headers: {
                    "x-folio-session": workspace.session,
                    "Content-Type": "application/octet-stream",
                  },
                  body: file.slice(
                    part * transfer.chunkBytes,
                    (part + 1) * transfer.chunkBytes,
                  ),
                },
              ).catch(() => null);
              if (r?.ok) {
                succeeded = true;
                break;
              }
              if (r && r.status < 500) throw new Error((await r.json()).error);
            }
            if (!succeeded)
              throw new Error(
                "Upload interrupted. Please retry when the keeper reconnects.",
              );
          }
          await api(
            `drafts/${draft.id}/uploads/${transfer.id}/complete`,
            "POST",
          );
        } catch (e) {
          await api(
            `drafts/${draft.id}/uploads/${transfer.id}`,
            "DELETE",
          ).catch(() => {});
          throw e;
        }
      }
      await refresh();
      setNotice({
        text: `${files.length} file${files.length > 1 ? "s" : ""} added to your local draft.`,
      });
    });
    if (filesInput.current) filesInput.current.value = "";
  }
  const selectDraft = (id: string) => {
    setSelected(id);
    setQuery("");
  };
  const counts = workspace.drafts.reduce((n, d) => n + d.files.length, 0);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button
          className="wordmark"
          onClick={() => navigate("library")}
          aria-label="Folio home"
        >
          <span className="brand-mark">
            <i />
            <i />
            <i />
          </span>
          folio<span className="brand-period">.</span>
        </button>
        <div className="workspace-switch">
          <span className="workspace-icon">
            <Leaf size={17} />
          </span>
          <span>
            Personal archive<small>KEEPER WORKSPACE</small>
          </span>
          <MoreHorizontal size={17} />
        </div>
        <Link href="/" className="nav-item">
          <BookOpen size={17} /> Public reading room <ArrowUpRight size={14} />
        </Link>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {sections.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              className={`nav-item ${view === item.id ? "active" : ""}`}
            >
              <item.icon size={17} strokeWidth={1.6} />
              <span>{item.label}</span>
              {item.id === "library" && (
                <small>{workspace.drafts.length}</small>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="small-spark">✳</span>
          <p>
            Good archives outlive
            <br />
            their archivists.
          </p>
          <small>
            Give your collection a future
            <br />
            beyond a single keeper.
          </small>
        </div>
        <div className="sidebar-bottom">
          <button
            className="node-indicator"
            onClick={() => navigate("storage")}
          >
            <span className={`status-dot ${node?.ready ? "green" : "amber"}`} />
            <span>
              {node?.ready
                ? "Bee node connected"
                : node?.online
                  ? "Bee node · read only"
                  : "Connect your Bee node"}
              <small>
                {node?.version
                  ? `v${node.version.split("-")[0]} · On this computer`
                  : "Your preservation starts here"}
              </small>
            </span>
            <ChevronRight size={14} />
          </button>
          <div className="sidebar-credit">
            BUILT ON <span>SWARM</span>
            <span className="swarm-dots">⠿</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={12} />
            <button
              onClick={() => {
                setSelected(null);
              }}
            >
              {sections.find((s) => s.id === view)?.label}
            </button>
            {draft && (
              <>
                <ChevronRight size={12} />
                <span className="truncate">{draft.title}</span>
              </>
            )}
          </div>
          <div className="topbar-right">
            <span className="local-label">
              <span />
              Private workspace
            </span>
            <button
              className="text-button"
              onClick={async () => {
                await fetch("/api/auth", { method: "DELETE" });
                location.assign("/");
              }}
            >
              Leave workspace
            </button>
          </div>
        </header>
        <main className="main-content">
          {job && job.status !== "complete" && !publishOpen && (
            <div className="preservation-note" style={{ marginBottom: 24 }}>
              <ShieldCheck size={20} />
              <div>
                <strong>
                  {job.status === "running"
                    ? "A publication is running on your keeper."
                    : "A previous publication needs attention."}
                </strong>
                <p>{job.step}</p>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setSelected(job.draftId);
                  setPublishOpen(true);
                }}
              >
                Review publication
              </Button>
            </div>
          )}
          {view === "library" && !draft && (
            <>
              <section className="welcome-hero">
                <div className="hero-copy">
                  <div className="eyebrow">
                    <span />
                    PRESERVE WHAT MATTERS
                  </div>
                  <h1>
                    Knowledge deserves
                    <br />a longer <em>life.</em>
                  </h1>
                  <p>
                    A thoughtful home for your collections. Publish to Swarm,
                    <br className="desktop-break" /> keep one lasting address,
                    and let anyone recover the story.
                  </p>
                  <div className="hero-actions">
                    <Button onClick={create}>
                      <Plus size={15} />
                      Create a collection
                    </Button>
                    <button
                      className="text-button"
                      onClick={() => navigate("recovery")}
                    >
                      How recovery works <ArrowUpRight size={14} />
                    </button>
                  </div>
                </div>
                <div
                  className="hero-art"
                  aria-label="Synthetic archival folio illustrations"
                >
                  <div className="art-orbit" />
                  <div className="art-paper art-back">
                    <img src="/samples/folio-2.svg" alt="Indigo folio study" />
                  </div>
                  <div className="art-paper art-front">
                    <img src="/samples/folio-1.svg" alt="Ochre folio study" />
                    <span>
                      FOLIO NO. 001 <i>Carefully kept.</i>
                    </span>
                  </div>
                  <div className="art-caption">
                    <span className="tiny-cross">+</span> A future beyond its
                    keeper
                  </div>
                </div>
              </section>
              <div className="stats-strip">
                <div>
                  <Layers size={17} />
                  <span>
                    <strong>{workspace.drafts.length}</strong> collections
                  </span>
                </div>
                <div>
                  <FileText size={17} />
                  <span>
                    <strong>{counts}</strong> files gathered
                  </span>
                </div>
                <div>
                  <ShieldCheck size={17} />
                  <span>
                    <strong>{workspace.published.length}</strong> verified
                    publications
                  </span>
                </div>
                <button onClick={() => navigate("storage")}>
                  <span
                    className={`status-dot ${node?.ready ? "green" : "amber"}`}
                  />
                  {node?.ready ? "Node ready" : "Node setup in progress"}
                  <ArrowUpRight size={13} />
                </button>
              </div>
              <section className="collections-section">
                <div className="section-heading">
                  <div>
                    <h2>
                      Your collections <span>{workspace.drafts.length}</span>
                    </h2>
                    <p>Small beginnings. Lasting records.</p>
                  </div>
                  <div className="section-tools">
                    <div className="search-field">
                      <Search size={15} />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Find a collection…"
                        aria-label="Find a collection"
                      />
                    </div>
                    <button
                      className="icon-button"
                      onClick={create}
                      aria-label="Create collection"
                    >
                      <Plus size={19} />
                    </button>
                  </div>
                </div>
                {loading ? (
                  <div className="empty-state">
                    <LoaderCircle className="animate-spin" />
                    Opening your workspace…
                  </div>
                ) : (
                  <div className="collection-grid">
                    {workspace.drafts
                      .filter((d) =>
                        d.title.toLowerCase().includes(query.toLowerCase()),
                      )
                      .map((d) => (
                        <button
                          className="collection-card"
                          key={d.id}
                          onClick={() => selectDraft(d.id)}
                        >
                          <div className="collection-cover">
                            {d.files.length ? (
                              <div className="cover-pages">
                                {d.files.slice(0, 3).map((f, i) => (
                                  <div
                                    className={`cover-page page-${i}`}
                                    key={f.id}
                                  >
                                    {f.type.startsWith("image/") ? (
                                      <KeeperImage
                                        draftId={d.id}
                                        file={f}
                                        alt=""
                                      />
                                    ) : (
                                      <FileText size={35} />
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <FolderOpen size={45} strokeWidth={1} />
                            )}
                            <Badge className="draft-badge">
                              {workspace.published.some((a) => a.id === d.id)
                                ? "Published"
                                : "Local draft"}
                            </Badge>
                          </div>
                          <div className="collection-info">
                            <div className="collection-title">
                              <h3>{d.title}</h3>
                              <ArrowUpRight size={17} />
                            </div>
                            <p>
                              {d.files.length} folios <span>·</span>{" "}
                              {formatBytes(
                                d.files.reduce((n, f) => n + f.size, 0),
                              )}
                            </p>
                            <div className="collection-bottom">
                              <span>
                                {d.sample
                                  ? "SYNTHETIC STUDY"
                                  : "PERSONAL COLLECTION"}
                              </span>
                              <span>
                                {new Date(d.updatedAt).toLocaleDateString(
                                  undefined,
                                  { month: "short", day: "numeric" },
                                )}
                              </span>
                            </div>
                          </div>
                        </button>
                      ))}
                    <button className="new-collection-card" onClick={create}>
                      <span>
                        <Plus size={23} strokeWidth={1.4} />
                      </span>
                      <h3>Begin a new collection</h3>
                      <p>
                        Every archive starts with
                        <br />
                        something worth keeping.
                      </p>
                    </button>
                  </div>
                )}
                {!workspace.drafts.length && !loading && (
                  <div className="sample-banner">
                    <div>
                      <Leaf size={19} />
                      <p>
                        Start with a small study.
                        <span>
                          Explore six synthetic folios before adding your own
                          material.
                        </span>
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      disabled={!!busy}
                      onClick={() =>
                        run("Preparing sample", async () => {
                          const d = await api("sample");
                          await refresh();
                          setSelected(d.id);
                        })
                      }
                    >
                      {busy === "Preparing sample" ? (
                        <LoaderCircle className="animate-spin" size={14} />
                      ) : (
                        <BookOpen size={14} />
                      )}
                      Explore sample collection
                    </Button>
                  </div>
                )}
              </section>
              <div className="bottom-note">
                <ShieldCheck size={15} />
                <span>
                  A shared address. A complete recovery. A collection that
                  travels beyond this app.
                </span>
                <button onClick={() => navigate("evidence")}>
                  Our preservation promise <ArrowRight size={13} />
                </button>
              </div>
            </>
          )}

          {view === "library" && draft && (
            <>
              <button className="back-link" onClick={() => setSelected(null)}>
                <ArrowLeft size={14} />
                All collections
              </button>
              <div className="detail-heading">
                <div>
                  <div className="eyebrow">
                    {draft.sample
                      ? "SYNTHETIC STUDY COLLECTION"
                      : "YOUR COLLECTION"}
                    <Badge variant="outline">
                      {published ? "Published · editing draft" : "Local draft"}
                    </Badge>
                  </div>
                  <h1>{draft.title}</h1>
                  <p>
                    {draft.description ||
                      "A collection of things worth keeping."}
                  </p>
                </div>
                <div className="detail-actions">
                  <Button
                    variant="outline"
                    disabled={!!busy}
                    onClick={() => filesInput.current?.click()}
                  >
                    <Plus size={15} />
                    Add files
                  </Button>
                  <Button
                    onClick={() => {
                      setBatchId(batch?.id || "");
                      setJob(null);
                      setPublishOpen(true);
                    }}
                    disabled={!draft.files.length || !!busy}
                  >
                    <Upload size={15} />
                    Publish collection
                  </Button>
                </div>
              </div>
              {published && (
                <div className="published-banner">
                  <ShieldCheck size={19} />
                  <div>
                    <strong>A public archive is available</strong>
                    <span>
                      Browse the network copy in the independent reader.
                    </span>
                    <button
                      className="text-button restore-link"
                      disabled={!!busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Replace this local draft with the latest files from Swarm? Unsaved draft changes will be discarded.",
                          )
                        )
                          run("Restoring the network version", async () => {
                            await api(`archives/${draft.id}/edit`);
                            await refresh();
                            setNotice({
                              text: "Editing draft restored from Swarm and verified.",
                            });
                          });
                      }}
                    >
                      Restore published files
                    </button>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() =>
                      openReader(published.descriptor.manifestReference)
                    }
                  >
                    Open reader <ArrowUpRight size={14} />
                  </Button>
                  <button
                    className="icon-button"
                    title="Copy stable archive link"
                    onClick={() =>
                      copy(
                        `${location.origin}/archive/${published.descriptor.manifestReference}`,
                      )
                    }
                  >
                    <Copy size={16} />
                  </button>
                </div>
              )}
              <div className="section-heading compact">
                <div>
                  <h2>
                    Inside this collection <span>{draft.files.length}</span>
                  </h2>
                  <p>
                    {formatBytes(draft.files.reduce((n, f) => n + f.size, 0))} ·
                    Files stay local until you publish.
                  </p>
                </div>
                <button
                  className="text-button"
                  onClick={() => {
                    setTitle(draft.title);
                    setDescription(draft.description);
                    setCreateOpen(true);
                  }}
                >
                  Edit collection details
                </button>
              </div>
              <input
                ref={filesInput}
                type="file"
                multiple
                className="sr-only"
                onChange={(e) => upload(e.target.files)}
                aria-label="Add collection files"
              />
              <div
                className="folio-grid"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  upload(e.dataTransfer.files);
                }}
              >
                {draft.files.map((file, i) => (
                  <article className="folio-card" key={file.id}>
                    <button
                      className="folio-image"
                      onClick={() => setPreview(file)}
                      aria-label={`Preview ${file.name}`}
                    >
                      {file.type.startsWith("image/") ? (
                        <KeeperImage
                          draftId={draft.id}
                          file={file}
                          alt={file.name}
                        />
                      ) : (
                        <FileText size={48} strokeWidth={1} />
                      )}
                      <span>{String(i + 1).padStart(2, "0")}</span>
                    </button>
                    <div className="folio-info">
                      <h3 title={file.name}>
                        {file.name.replace(/\.svg$/i, "")}
                      </h3>
                      <div>
                        <span>
                          {formatBytes(file.size)} ·{" "}
                          {file.type.startsWith("image/")
                            ? "Image"
                            : "Document"}
                        </span>
                        <button
                          className="icon-button"
                          disabled={!!busy}
                          aria-label={`Remove ${file.name}`}
                          onClick={() =>
                            run("Removing file", async () => {
                              await api(
                                `drafts/${draft.id}/files/${file.id}`,
                                "DELETE",
                              );
                              await refresh();
                            })
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
                <button
                  className="upload-tile"
                  onClick={() => filesInput.current?.click()}
                >
                  <Plus size={24} strokeWidth={1.2} />
                  <strong>Add to the collection</strong>
                  <span>
                    Drop files here, or browse
                    <br />
                    Up to 25 MB per file
                  </span>
                </button>
              </div>
              <div className="bottom-note">
                <Database size={15} />
                <span>
                  Publication includes an open inventory and a checksum for
                  every file.
                </span>
                <button onClick={() => navigate("recovery")}>
                  About recovery <ArrowRight size={13} />
                </button>
              </div>
            </>
          )}

          {view === "storage" && (
            <>
              <div className="page-intro">
                <p className="eyebrow">THE WORK BEHIND PRESERVATION</p>
                <h1>A place on the network.</h1>
                <p>
                  Your Bee node publishes the archive. Postage keeps its data
                  paid for.
                </p>
              </div>
              <div className="storage-layout">
                <section className="panel node-panel">
                  <div className="panel-title">
                    <span className="panel-icon">
                      <Radio size={20} />
                    </span>
                    <div>
                      <h2>Your Bee node</h2>
                      <p>Running on this computer</p>
                    </div>
                    <Badge variant="outline">
                      {node?.online ? "Connected" : "Offline"}
                    </Badge>
                  </div>
                  <div className="node-visual">
                    <div className="node-rings">
                      <span>
                        <Leaf size={30} strokeWidth={1.2} />
                      </span>
                    </div>
                    <strong>
                      {node?.mode === "light"
                        ? "Light node"
                        : node?.online
                          ? "Ultra-light node"
                          : "Waiting for Bee"}
                    </strong>
                    <p>{node?.message || "Checking the local node…"}</p>
                  </div>
                  <div className="node-facts">
                    <div>
                      <span>Version</span>
                      <strong>{node?.version?.split("-")[0] || "—"}</strong>
                    </div>
                    <div>
                      <span>Connected peers</span>
                      <strong>{node?.peers ?? "—"}</strong>
                    </div>
                    <div>
                      <span>API compatibility</span>
                      <strong>
                        {node?.compatible ? "Compatible" : "Checking"}
                      </strong>
                    </div>
                    <div>
                      <span>API endpoint</span>
                      <code>127.0.0.1:1633</code>
                    </div>
                  </div>
                  {node?.wallet && (
                    <div className="wallet-field">
                      <span>NODE WALLET</span>
                      <button onClick={() => copy(node.wallet!)}>
                        <code>
                          {node.wallet.slice(0, 12)}…{node.wallet.slice(-8)}
                        </code>
                        <Copy size={13} />
                      </button>
                    </div>
                  )}
                  <Button
                    variant="outline"
                    onClick={refreshNode}
                    className="full-width"
                  >
                    Refresh node status
                  </Button>
                </section>
                <div>
                  <section className="panel">
                    <div className="panel-title">
                      <span className="panel-icon">
                        <Database size={20} />
                      </span>
                      <div>
                        <h2>Preservation storage</h2>
                        <p>Paid capacity, with an honest horizon</p>
                      </div>
                    </div>
                    {node?.batches.length ? (
                      node.batches.map((b) => (
                        <div className="batch-card" key={b.id}>
                          <div className="batch-heading">
                            <strong>{b.label || "Archive storage"}</strong>
                            <Badge variant="outline">
                              {b.usable ? "Usable" : "Synchronising"}
                            </Badge>
                          </div>
                          <p className="ttl-number">
                            {(b.remainingSeconds / 86400).toFixed(1)}{" "}
                            <span>days estimated remaining</span>
                          </p>
                          <Progress value={Math.min(100, b.usage * 100)} />
                          <div className="capacity-label">
                            <span>
                              {formatBytes(b.capacity - b.remainingBytes)} used
                            </span>
                            <span>{formatBytes(b.capacity)} capacity</span>
                          </div>
                          <p className="fine-print">
                            Checked{" "}
                            {new Date(node.observedAt).toLocaleTimeString()}.
                            Lifetime changes with network pricing.{" "}
                            {b.immutable
                              ? "Immutable batch."
                              : "Mutable batch — unsuitable for this archive."}
                          </p>
                          <Button
                            variant="outline"
                            disabled={!!busy || !b.immutable}
                            onClick={() =>
                              run("Getting renewal estimate", async () =>
                                setQuote(
                                  await api("storage/quote", "POST", {
                                    action: "renew",
                                    batchId: b.id,
                                    days,
                                    megabytes: 100,
                                  }),
                                ),
                              )
                            }
                          >
                            Extend by {days} days <ArrowRight size={14} />
                          </Button>
                        </div>
                      ))
                    ) : (
                      <div className="storage-empty">
                        <Database size={30} strokeWidth={1.2} />
                        <h3>Your archive needs a storage batch.</h3>
                        <p>
                          We’ll estimate the cost before you commit. Each batch
                          pays for both capacity and a period of storage.
                        </p>
                      </div>
                    )}
                    <div className="storage-buy">
                      <div>
                        <Label htmlFor="days">Storage period</Label>
                        <select
                          id="days"
                          value={days}
                          onChange={(e) => setDays(Number(e.target.value))}
                        >
                          <option value={7}>7 days</option>
                          <option value={14}>14 days</option>
                          <option value={30}>30 days</option>
                        </select>
                      </div>
                      <Button
                        disabled={!node?.ready || !!busy}
                        onClick={() =>
                          run("Getting storage estimate", async () =>
                            setQuote(
                              await api("storage/quote", "POST", {
                                action: "buy",
                                days,
                                megabytes: 100,
                              }),
                            ),
                          )
                        }
                      >
                        {busy.startsWith("Getting") ? (
                          <LoaderCircle size={15} className="animate-spin" />
                        ) : (
                          <Plus size={15} />
                        )}
                        Estimate 100 MB storage
                      </Button>
                    </div>
                  </section>
                  <section className="note-panel">
                    <ShieldCheck size={21} />
                    <div>
                      <h3>Preservation is a practice.</h3>
                      <p>
                        Swarm storage needs continued funding. Folio shows its
                        estimated lifetime and gives you a renewal path. A
                        stable address makes an archive findable; paid storage
                        keeps it retrievable.
                      </p>
                    </div>
                  </section>
                  {!node?.ready && (
                    <section className="setup-steps">
                      <h3>Finish node setup</h3>
                      <p>
                        <span>1</span>
                        <code>npm run bee:start</code>
                        {node?.online && <Check size={15} />}
                      </p>
                      <p>
                        <span>2</span>Redeem your event gift with{" "}
                        <code>npm run bee:fund</code>
                      </p>
                      <p>
                        <span>3</span>Configure a Gnosis RPC in{" "}
                        <code>.env.local</code> and restart Bee.
                      </p>
                      <small>
                        Node data and credentials stay in the ignored .runtime
                        folder.
                      </small>
                    </section>
                  )}
                </div>
              </div>
            </>
          )}

          {view === "recovery" && (
            <>
              <div className="page-intro">
                <p className="eyebrow">INDEPENDENCE, BY DESIGN</p>
                <h1>
                  Leave the app.
                  <br />
                  <em>Keep the archive.</em>
                </h1>
                <p>
                  A public address is enough to find the collection and bring
                  every file home.
                </p>
              </div>
              <div className="recovery-layout">
                <section className="panel recovery-panel">
                  <span className="large-icon">
                    <ArrowDownToLine size={28} strokeWidth={1.3} />
                  </span>
                  <h2>Open an archive</h2>
                  <p>
                    The independent reader runs separately from this publisher
                    and retrieves the inventory directly from Swarm.
                  </p>
                  <Label htmlFor="archive-address">
                    Public archive address
                  </Label>
                  <Input
                    id="archive-address"
                    placeholder="Paste an archive link or reference"
                    value={archiveInput}
                    onChange={(e) => setArchiveInput(e.target.value)}
                  />
                  <Button
                    className="full-width"
                    onClick={() => openReader(archiveInput)}
                  >
                    Open independent reader <ArrowUpRight size={15} />
                  </Button>
                  <p className="fine-print">
                    Start it with <code>npm run reader</code>. No account,
                    publisher key, or local catalogue is required.
                  </p>
                </section>
                <div className="recovery-steps">
                  {[
                    {
                      n: "01",
                      title: "Find the current collection",
                      text: "The stable address resolves to one immutable snapshot. Every file comes from the same version.",
                    },
                    {
                      n: "02",
                      title: "Retrieve the whole story",
                      text: "An inventory on Swarm lists every file, its original name, size, and checksum.",
                    },
                    {
                      n: "03",
                      title: "Verify what comes home",
                      text: "Each download is checked. Complete recovery produces a ZIP and a verification report.",
                    },
                  ].map((s) => (
                    <div key={s.n}>
                      <span>{s.n}</span>
                      <section>
                        <h3>{s.title}</h3>
                        <p>{s.text}</p>
                      </section>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {view === "evidence" && (
            <>
              <div className="page-intro">
                <p className="eyebrow">CLAIMS YOU CAN CHECK</p>
                <h1>Preservation, with receipts.</h1>
                <p>
                  Real network results, public identifiers, and a repeatable
                  recovery path.
                </p>
              </div>
              <div className="evidence-overview">
                <div className="panel">
                  <ShieldCheck size={24} strokeWidth={1.3} />
                  <strong>{workspace.published.length}</strong>
                  <span>Verified publications</span>
                </div>
                <div className="panel">
                  <Radio size={24} strokeWidth={1.3} />
                  <strong>{node?.online ? "Live" : "Offline"}</strong>
                  <span>Local Bee node</span>
                </div>
                <div className="panel">
                  <Database size={24} strokeWidth={1.3} />
                  <strong>{node?.batches.length || 0}</strong>
                  <span>Storage batches</span>
                </div>
              </div>
              <section className="panel evidence-table">
                <h2>The verification trail</h2>
                {[
                  {
                    icon: Radio,
                    title: "A node we operate",
                    text: "Public node mode, version and wallet address; no private configuration.",
                    status: node?.online ? "Node responding" : "Pending setup",
                  },
                  {
                    icon: Layers,
                    title: "One address, multiple versions",
                    text: "The feed owner, topic, manifest and each published snapshot are recorded.",
                    status: workspace.published.length
                      ? "Public records saved"
                      : "Awaiting publication",
                  },
                  {
                    icon: CheckCheck,
                    title: "Every byte accounted for",
                    text: "An independent endpoint retrieves each file and validates its size and checksum.",
                    status: workspace.published.length
                      ? "Verified at publication"
                      : "Awaiting verification",
                  },
                  {
                    icon: FileText,
                    title: "Evidence in the repository",
                    text: "Successful live runs write public JSON receipts under evidence/.",
                    status: workspace.published.length
                      ? "Receipts available"
                      : "No live receipts yet",
                  },
                ].map((item) => (
                  <div className="evidence-row" key={item.title}>
                    <item.icon size={20} strokeWidth={1.4} />
                    <section>
                      <h3>{item.title}</h3>
                      <p>{item.text}</p>
                    </section>
                    <Badge variant="outline">{item.status}</Badge>
                  </div>
                ))}
              </section>
              <div className="bottom-note">
                <CircleHelp size={16} />
                <span>
                  Receipts record a check at a moment in time. They do not
                  promise indefinite availability.
                </span>
              </div>
            </>
          )}
        </main>
        <footer className="app-footer">
          <span>
            FOLIO <i>—</i> An archive beyond its keeper.
          </span>
          <span>
            Made to be recovered <Leaf size={12} />
          </span>
        </footer>
      </div>

      {notice && (
        <div
          className={`toast ${notice.error ? "toast-error" : ""}`}
          role={notice.error ? "alert" : "status"}
        >
          {notice.error ? <CircleHelp size={17} /> : <Check size={17} />}
          <span>{notice.text}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice(null)}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {busy && (
        <div className="busy-indicator" role="status">
          <LoaderCircle size={14} className="animate-spin" />
          {busy}…
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {draft ? "Collection details" : "Begin a collection"}
            </DialogTitle>
            <DialogDescription>
              Give these records a name and a little context for the people who
              find them.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run("Saving collection", async () => {
                const result = await api(
                  draft ? `drafts/${draft.id}` : "drafts",
                  draft ? "PATCH" : "POST",
                  { title, description },
                );
                await refresh();
                setSelected(result.id);
                setCreateOpen(false);
              });
            }}
          >
            <div className="form-field">
              <Label htmlFor="title">Collection name</Label>
              <Input
                id="title"
                required
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Letters from the valley"
              />
            </div>
            <div className="form-field">
              <Label htmlFor="description">A note for future readers</Label>
              <Textarea
                id="description"
                maxLength={4000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is in this collection, and why does it matter?"
                rows={4}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button disabled={!!busy || !title.trim()} type="submit">
                {draft ? "Save details" : "Create collection"}
                <ArrowRight size={14} />
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={publishOpen}
        onOpenChange={(open) => {
          if (job?.status !== "running") setPublishOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {job?.status === "complete"
                ? "A future on the network."
                : "Publish your collection"}
            </DialogTitle>
            <DialogDescription>
              {job
                ? "Every file is checked through an independent endpoint before publication is reported as verified."
                : "Publish a complete snapshot and give your collection one stable address."}
            </DialogDescription>
          </DialogHeader>
          {job ? (
            <div className="publish-progress">
              <div className={`publish-symbol ${job.status}`}>
                {job.status === "complete" ? (
                  <CheckCheck size={30} />
                ) : job.status === "failed" ? (
                  <CircleHelp size={30} />
                ) : (
                  <LoaderCircle className="animate-spin" size={30} />
                )}
              </div>
              <strong>{job.step}</strong>
              <Progress value={job.progress} />
              <p>
                {job.error ||
                  `${job.progress}% · ${draft?.title || "Your archive"}`}
              </p>
              {job.status === "failed" && (
                <Button
                  variant="outline"
                  disabled={!!busy}
                  onClick={() =>
                    run("Checking the public feed", async () => {
                      const result = await api(
                        `jobs/${job.id}/reconcile`,
                        "POST",
                      );
                      setJob(result);
                      await refresh();
                    })
                  }
                >
                  Recheck publication on Swarm
                </Button>
              )}
              {job.result && (
                <>
                  <Button
                    onClick={() =>
                      openReader(job.result!.descriptor.manifestReference)
                    }
                  >
                    Open independent reader <ArrowUpRight size={14} />
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      copy(
                        `${location.origin}/archive/${job.result!.descriptor.manifestReference}`,
                      )
                    }
                  >
                    <Copy size={14} />
                    Copy archive address
                  </Button>
                </>
              )}
              {job.status === "failed" && (
                <Button variant="outline" onClick={() => setJob(null)}>
                  Review and retry
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="publish-summary">
                <BookOpen size={25} strokeWidth={1.3} />
                <div>
                  <strong>{draft?.title}</strong>
                  <span>
                    {draft?.files.length} files ·{" "}
                    {formatBytes(
                      draft?.files.reduce((n, f) => n + f.size, 0) || 0,
                    )}
                  </span>
                </div>
              </div>
              {!node?.ready || !usableBatches.length ? (
                <div className="publish-warning">
                  <CircleHelp size={20} />
                  <p>
                    {node?.message ||
                      "Your node needs to be ready before publishing."}
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setPublishOpen(false);
                      navigate("storage");
                    }}
                  >
                    Open node & storage <ArrowRight size={14} />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="form-field">
                    <Label htmlFor="publish-batch">Storage batch</Label>
                    <select
                      id="publish-batch"
                      value={batchId}
                      onChange={(e) => setBatchId(e.target.value)}
                    >
                      {usableBatches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.label || "Archive storage"} ·{" "}
                          {(b.remainingSeconds / 86400).toFixed(1)} days
                          remaining
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="fine-print">
                    This publishes your files publicly to Swarm. Your
                    collection’s inventory and file checksums travel with it.
                  </p>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setPublishOpen(false)}
                    >
                      Keep as draft
                    </Button>
                    <Button
                      onClick={() =>
                        run("Starting publication", async () => {
                          setJob(
                            await api(`drafts/${draft!.id}/publish`, "POST", {
                              batchId,
                            }),
                          );
                        })
                      }
                      disabled={!batchId || !!busy}
                    >
                      <Upload size={14} />
                      Publish to Swarm
                    </Button>
                  </DialogFooter>
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!preview} onOpenChange={() => setPreview(null)}>
        <DialogContent className="preview-dialog">
          <DialogHeader>
            <DialogTitle>{preview?.name}</DialogTitle>
            <DialogDescription>
              {preview ? `${formatBytes(preview.size)} · ${preview.type}` : ""}
            </DialogDescription>
          </DialogHeader>
          {preview?.type.startsWith("image/") ? (
            <KeeperImage
              className="preview-image"
              draftId={draft!.id}
              file={preview}
              alt={preview.name}
            />
          ) : (
            <div className="document-preview">
              <FileText size={60} strokeWidth={1} />
              <p>Download this document to read it.</p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={!!busy}
              onClick={() =>
                run("Downloading file", async () => {
                  if (!preview || !draft) return;
                  download(
                    await readKeeperFile(draft.id, preview),
                    preview.name,
                    preview.type,
                  );
                })
              }
            >
              <ArrowDownToLine size={14} /> Download original
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!quote} onOpenChange={() => setQuote(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {quote?.action === "renew"
                ? "Extend your archive’s horizon"
                : "Make room for your archive"}
            </DialogTitle>
            <DialogDescription>
              Review the estimated storage cost before using your node’s funds.
            </DialogDescription>
          </DialogHeader>
          <div className="quote-price">
            {quote?.bzz}
            <span>xBZZ</span>
          </div>
          <p>
            {quote?.action === "renew"
              ? "Extend the existing batch"
              : "Purchase an immutable batch for at least 100 MB"}{" "}
            by approximately {quote?.days} days.
          </p>
          <p className="fine-print">
            {quote?.note} Quote expires at{" "}
            {quote ? new Date(quote.expiresAt).toLocaleTimeString() : ""}.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuote(null)}>
              Cancel
            </Button>
            <Button
              disabled={!!busy}
              onClick={() =>
                run("Waiting for storage confirmation", async () => {
                  await api("storage/execute", "POST", { quoteId: quote!.id });
                  setQuote(null);
                  await refreshNode();
                  setNotice({
                    text: "Storage operation completed. The latest node observation is shown.",
                  });
                })
              }
            >
              {busy ? (
                <LoaderCircle size={15} className="animate-spin" />
              ) : (
                <Check size={15} />
              )}
              Confirm storage payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
