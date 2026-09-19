import { mkdir, readFile, writeFile, rename, readdir } from "node:fs/promises";
import path from "node:path";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { PrivateKey } from "@ethersphere/bee-js";
import type { Draft, PublishedArchive, PublishJob } from "../archive-format";

export const ROOT = process.cwd();
export const RUNTIME = path.join(ROOT, ".runtime", "folio");
export const BEE_URL = process.env.BEE_URL || "http://127.0.0.1:1633";
export const VERIFY_URL =
  process.env.FOLIO_VERIFY_URL || "https://api.gateway.ethswarm.org";
export const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
export function idPath(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid identifier.");
  return id;
}
export const draftFolder = (id: string) =>
  path.join(RUNTIME, "drafts", idPath(id));
export async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8"));
}
export async function writeJson(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
  });
  await rename(temporary, file);
}
export async function getDraft(id: string) {
  return readJson<Draft>(path.join(draftFolder(id), "draft.json"));
}
export async function saveDraft(draft: Draft) {
  draft.updatedAt = new Date().toISOString();
  await writeJson(path.join(draftFolder(draft.id), "draft.json"), draft);
}
export async function listDrafts(): Promise<Draft[]> {
  const directory = path.join(RUNTIME, "drafts");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const entries = await readdir(directory, { withFileTypes: true });
  const drafts = await Promise.all(
    entries.filter((d) => d.isDirectory()).map((d) => getDraft(d.name)),
  );
  return drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function createDraft(
  title: string,
  description: string,
): Promise<Draft> {
  const draft: Draft = {
    id: randomUUID(),
    title,
    description,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    files: [],
  };
  await saveDraft(draft);
  return draft;
}
export async function listPublished(): Promise<PublishedArchive[]> {
  try {
    return await readJson(path.join(RUNTIME, "published.json"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
export async function savePublished(archive: PublishedArchive) {
  const existing = await listPublished();
  await writeJson(path.join(RUNTIME, "published.json"), [
    archive,
    ...existing.filter((a) => a.id !== archive.id),
  ]);
  // This public descriptor is deliberately tracked. It never includes a signing key.
  await writeJson(
    path.join(ROOT, "evidence", "archives", `${archive.id}.json`),
    archive.descriptor,
  );
}
export async function publisherKey(archiveId: string) {
  const file = path.join(RUNTIME, "keys", `${idPath(archiveId)}.key`);
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  try {
    return new PrivateKey((await readFile(file, "utf8")).trim());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const key = new PrivateKey(randomBytes(32));
    await writeFile(file, key.toHex(), { flag: "wx", mode: 0o600 });
    return key;
  }
}
type ServerState = {
  token: string;
  jobs: Map<string, PublishJob>;
  quotes: Map<
    string,
    {
      action: "buy" | "renew";
      batchId?: string;
      days: number;
      megabytes: number;
      plur: string;
      expires: number;
    }
  >;
};
const globalState = globalThis as typeof globalThis & { __folio?: ServerState };
export const state: ServerState = (globalState.__folio ??= {
  token: randomBytes(32).toString("hex"),
  jobs: new Map(),
  quotes: new Map(),
});

export function assertLocal(request: Request, mutation = false) {
  const url = new URL(request.url);
  const loopback = ["127.0.0.1", "localhost", "[::1]"];
  if (!loopback.includes(url.hostname))
    throw new Error("The publisher is available only on this computer.");
  const host = request.headers.get("host");
  if (host && !loopback.includes(new URL(`${url.protocol}//${host}`).hostname))
    throw new Error("The publisher is available only on this computer.");
  const origin = request.headers.get("origin");
  // Next may normalise the request URL to localhost even when the browser uses
  // 127.0.0.1. Accept only loopback aliases on the same protocol and port.
  if (origin) {
    const source = new URL(origin);
    if (
      !loopback.includes(source.hostname) ||
      source.protocol !== url.protocol ||
      source.port !== url.port
    )
      throw new Error("Cross-origin access is not permitted.");
  }
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new Error("Cross-site access is not permitted.");
  if (mutation && request.headers.get("x-folio-session") !== state.token)
    throw new Error(
      "Your local session has changed. Refresh the page and retry.",
    );
}
