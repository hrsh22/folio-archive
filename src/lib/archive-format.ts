import { z } from "zod";

export const REFERENCE = /^[0-9a-f]{64}$/i;
export const OWNER = /^(0x)?[0-9a-f]{40}$/i;
export const MAX_FILES = 200;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;

export function safePath(value: string): string {
  const clean = value.normalize("NFC");
  if (
    !clean ||
    clean.length > 240 ||
    clean.startsWith("/") ||
    /[\\\x00-\x1f\x7f]/.test(clean) ||
    clean.includes(":")
  )
    throw new Error("Unsafe archive path.");
  if (clean.split("/").some((p) => !p || p === "." || p === ".."))
    throw new Error("Unsafe archive path.");
  return clean;
}

export const fileSchema = z.object({
  id: z.string().min(1).max(80),
  path: z.string().refine((p) => {
    try {
      safePath(p);
      return p.startsWith("files/");
    } catch {
      return false;
    }
  }, "Archive files must have safe paths inside files/"),
  name: z.string().min(1).max(240),
  type: z.string().min(1).max(150),
  size: z.number().int().min(0).max(MAX_FILE_BYTES),
  sha256: z.string().regex(REFERENCE),
  caption: z.string().max(2000).default(""),
  source: z.string().max(2000).default(""),
});
export type ArchiveFile = z.infer<typeof fileSchema>;
export const descriptorSchema = z.object({
  format: z.literal("folio.archive-address"),
  version: z.literal(1),
  archiveId: z.string().uuid(),
  owner: z.string().regex(OWNER),
  topic: z.string().regex(REFERENCE),
  manifestReference: z.string().regex(REFERENCE),
});
export type Descriptor = z.infer<typeof descriptorSchema>;
export const archiveSchema = z
  .object({
    format: z.literal("folio.archive"),
    version: z.literal(1),
    archiveId: z.string().uuid(),
    title: z.string().min(1).max(120),
    description: z.string().max(4000),
    publishedAt: z.string().datetime(),
    previousSnapshot: z.string().regex(REFERENCE).nullable(),
    storage: z.object({
      batchId: z.string().regex(REFERENCE),
      observedAt: z.string().datetime(),
      remainingSeconds: z.number().min(0),
    }),
    files: z.array(fileSchema).min(1).max(MAX_FILES),
  })
  .superRefine((value, ctx) => {
    const paths = value.files.map((f) => f.path.toLowerCase());
    if (new Set(paths).size !== paths.length)
      ctx.addIssue({ code: "custom", message: "Duplicate archive paths." });
    if (new Set(value.files.map((f) => f.id)).size !== value.files.length)
      ctx.addIssue({ code: "custom", message: "Duplicate file identifiers." });
    if (value.files.reduce((n, f) => n + f.size, 0) > MAX_ARCHIVE_BYTES)
      ctx.addIssue({
        code: "custom",
        message: "Archive exceeds the recovery size limit.",
      });
  });
export type Archive = z.infer<typeof archiveSchema>;
export type Draft = {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  files: ArchiveFile[];
  descriptor?: Descriptor;
  baseSnapshot?: string;
  batchId?: string;
  sample?: boolean;
};
export type PublishedArchive = {
  id: string;
  title: string;
  descriptor: Descriptor;
  snapshot: string;
  publishedAt: string;
  batchId: string;
  fileCount: number;
  totalBytes: number;
};
export type BatchStatus = {
  id: string;
  label: string;
  usable: boolean;
  immutable: boolean;
  remainingSeconds: number;
  capacity: number;
  remainingBytes: number;
  usage: number;
};
export type NodeStatus = {
  online: boolean;
  ready: boolean;
  mode: string;
  version?: string;
  wallet?: string;
  peers: number;
  compatible: boolean;
  batches: BatchStatus[];
  observedAt: string;
  message: string;
  rpcConfigured?: boolean;
};
export type PublishJob = {
  id: string;
  draftId: string;
  status: "running" | "complete" | "failed";
  step: string;
  progress: number;
  error?: string;
  result?: PublishedArchive;
};

export function referenceFromInput(input: string): string {
  const trimmed = input.trim();
  if (REFERENCE.test(trimmed)) return trimmed.toLowerCase();
  try {
    const url = new URL(trimmed);
    const match = url.pathname.match(
      /\/(?:bzz|archive)\/([a-f0-9]{64})(?:\/|$)/i,
    );
    const reference =
      match?.[1] ||
      url.searchParams.get("archive") ||
      url.hash.replace(/^#/, "");
    if (reference && REFERENCE.test(reference)) return reference.toLowerCase();
  } catch {}
  throw new Error("Enter a 64-character Swarm reference or an archive link.");
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const n = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3);
  return `${(bytes / 1024 ** n).toFixed(n === 1 ? 0 : 1)} ${["B", "KB", "MB", "GB"][n]}`;
}
