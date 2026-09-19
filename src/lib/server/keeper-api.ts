import {
  beginUpload,
  putUploadPart,
  finishUpload,
  cancelUpload,
} from "./uploads";
import { CHUNK_BYTES } from "./access";
import { z } from "zod";
import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  MAX_FILES,
  MAX_FILE_BYTES,
  MAX_ARCHIVE_BYTES,
  REFERENCE,
  safePath,
  type Draft,
} from "@/lib/archive-format";
import { makeBee, readSnapshot } from "@/lib/network";
import {
  state,
  ROOT,
  VERIFY_URL,
  BEE_URL,
  createDraft,
  listDrafts,
  listPublished,
  getDraft,
  saveDraft,
  draftFolder,
  hash,
} from "@/lib/server/runtime";
import { nodeStatus } from "@/lib/server/node-status";
import {
  draftBusy,
  startPublication,
  initializeJobs,
  getPublication,
  reconcilePublication,
} from "@/lib/server/publish";
import { quoteStorage, executeStorage } from "@/lib/server/storage";

const metadata = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().max(4000).default(""),
});
const response = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

async function uploadFiles(draft: Draft, uploads: File[]) {
  if (draft.files.length + uploads.length > MAX_FILES)
    throw new Error(`An archive can contain up to ${MAX_FILES} files.`);
  if (
    draft.files.reduce((n, f) => n + f.size, 0) +
      uploads.reduce((n, f) => n + f.size, 0) >
    MAX_ARCHIVE_BYTES
  )
    throw new Error("This release supports collections up to 100 MB.");
  if (uploads.some((f) => f.size > MAX_FILE_BYTES))
    throw new Error("Each file must be 25 MB or smaller.");
  const additions = [];
  for (const file of uploads) {
    const name = safePath(file.name);
    const id = randomUUID();
    const ext = name.includes(".")
      ? name
          .split(".")
          .pop()!
          .replace(/[^a-zA-Z0-9]/g, "")
          .slice(0, 12)
      : "bin";
    const relative = `files/${id}.${ext}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    await mkdir(path.join(draftFolder(draft.id), "files"), {
      recursive: true,
      mode: 0o700,
    });
    await writeFile(path.join(draftFolder(draft.id), relative), bytes, {
      mode: 0o600,
      flag: "wx",
    });
    additions.push({
      id,
      path: relative,
      name,
      type: file.type || "application/octet-stream",
      size: bytes.length,
      sha256: hash(bytes),
      caption: "",
      source: "",
    });
  }
  draft.files.push(...additions);
  await saveDraft(draft);
  return draft;
}

// Serialise local mutations so concurrent tabs cannot lose a draft update.
let mutationQueue: Promise<unknown> = Promise.resolve();
export async function handleKeeper(request: Request, segments: string[]) {
  if (request.method === "GET") return handle(request, segments);
  const result = mutationQueue.then(() => handle(request, segments));
  mutationQueue = result.catch(() => {});
  return result;
}
async function handle(request: Request, segments: string[]) {
  try {
    await initializeJobs();
    const [resource, id, action, fileId] = segments;
    const method = request.method;
    if (resource === "state" && method === "GET") {
      const [drafts, published] = await Promise.all([
        listDrafts(),
        listPublished(),
      ]);
      return response({
        drafts,
        published,
        session: state.token,
        jobs: [...state.jobs.values()]
          .sort((a, b) => (a.startedAt || "").localeCompare(b.startedAt || ""))
          .slice(-20),
      });
    }
    if (resource === "jobs" && method === "POST" && action === "reconcile")
      return response(await reconcilePublication(id));
    if (resource === "node" && method === "GET")
      return response(await nodeStatus());
    if (resource === "jobs" && method === "GET")
      return state.jobs.has(id)
        ? response(state.jobs.get(id))
        : response(
            {
              error:
                "Job not found. If the app restarted, check the archive address before retrying.",
            },
            404,
          );
    if (resource === "sample" && method === "POST") {
      const draft = await createDraft(
        "The Spiti study collection",
        "A synthetic collection for learning how to preserve an archive. These illustrated folio studies are original demo artwork, not historical manuscripts.",
      );
      const samples = JSON.parse(
        await readFile(
          path.join(ROOT, "public", "samples", "index.json"),
          "utf8",
        ),
      ) as { name: string; file: string }[];
      const uploads = await Promise.all(
        samples.map(
          async (sample) =>
            new File(
              [
                await readFile(
                  path.join(ROOT, "public", "samples", sample.file),
                ),
              ],
              sample.name,
              { type: "image/svg+xml" },
            ),
        ),
      );
      draft.sample = true;
      return response(await uploadFiles(draft, uploads), 201);
    }
    if (resource === "drafts" && !id && method === "POST") {
      const input = metadata.parse(await request.json());
      return response(await createDraft(input.title, input.description), 201);
    }
    if (resource === "drafts" && id) {
      const draft = await getDraft(id);
      if (method === "GET" && !action) return response(draft);
      if (method !== "GET" && draftBusy(id))
        throw new Error(
          "This collection is being published. Wait until it finishes before editing.",
        );
      if (method === "PATCH" && !action) {
        Object.assign(draft, metadata.parse(await request.json()));
        await saveDraft(draft);
        return response(draft);
      }
      if (action === "uploads") {
        if (method === "POST" && !fileId)
          return response(await beginUpload(id, await request.json()), 201);
        if (method === "PUT" && fileId)
          return response(
            await putUploadPart(id, fileId, segments[4], request),
          );
        if (method === "POST" && fileId && segments[4] === "complete")
          return response(await finishUpload(id, fileId));
        if (method === "DELETE" && fileId)
          return response(await cancelUpload(id, fileId));
      }
      if (action === "files" && method === "POST") {
        const length = Number(request.headers.get("content-length"));
        if (length > MAX_ARCHIVE_BYTES + 1_000_000)
          throw new Error("Upload is too large.");
        const data = await request.formData();
        const files = data
          .getAll("files")
          .filter((file): file is File => file instanceof File);
        if (!files.length) throw new Error("Choose at least one file.");
        return response(await uploadFiles(draft, files));
      }
      if (action === "files" && fileId) {
        const file = draft.files.find((f) => f.id === fileId);
        if (!file) return response({ error: "File not found." }, 404);
        if (method === "GET") {
          const bytes = await readFile(
            path.join(draftFolder(id), safePath(file.path)),
          );
          const inline = /^(image\/(png|jpeg|webp|gif)|text\/plain)$/.test(
            file.type,
          );
          const part = new URL(request.url).searchParams.get("part");
          if (part !== null && !/^\d{1,3}$/.test(part))
            throw new Error("Invalid file part.");
          if (part === null && bytes.length > CHUNK_BYTES)
            throw new Error(
              "Use the file download button to retrieve this file in parts.",
            );
          const start = part === null ? 0 : Number(part) * CHUNK_BYTES;
          if (start > bytes.length) throw new Error("Invalid file part.");
          return new Response(
            part === null ? bytes : bytes.subarray(start, start + CHUNK_BYTES),
            {
              headers: {
                "Content-Type": file.type,
                "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
                "X-Content-Type-Options": "nosniff",
                "Content-Security-Policy": "sandbox",
                "Cache-Control": "no-store",
              },
            },
          );
        }
        if (method === "DELETE") {
          await rm(path.join(draftFolder(id), safePath(file.path)));
          draft.files = draft.files.filter((f) => f.id !== fileId);
          await saveDraft(draft);
          return response(draft);
        }
      }
      if (action === "publish" && method === "POST") {
        const { batchId } = z
          .object({ batchId: z.string().regex(REFERENCE) })
          .parse(await request.json());
        return response(await startPublication(id, batchId), 202);
      }
    }
    if (resource === "archives" && id && method === "GET") {
      const saved = (await listPublished()).find((a) => a.id === id);
      if (!saved) return response({ error: "Archive not found." }, 404);
      // Navigation uses a public address book; the inventory is always read from Swarm.
      let result;
      try {
        result = await readSnapshot(makeBee(BEE_URL), saved.descriptor);
      } catch {
        result = await readSnapshot(makeBee(VERIFY_URL), saved.descriptor);
      }
      return response({
        ...result,
        nextIndex: undefined,
        descriptor: saved.descriptor,
      });
    }
    if (
      resource === "archives" &&
      id &&
      action === "edit" &&
      method === "POST"
    ) {
      if (draftBusy(id))
        throw new Error("Wait for the current publication to finish.");
      const saved = (await listPublished()).find((a) => a.id === id);
      const oldDraft = await getDraft(id).catch(() => null);
      const descriptor = saved?.descriptor || oldDraft?.descriptor;
      if (!descriptor) throw new Error("Archive address not found.");
      const bee = makeBee(BEE_URL);
      const { archive, snapshot } = await readSnapshot(bee, descriptor);
      const draft: Draft = {
        id,
        title: archive.title,
        description: archive.description,
        createdAt: archive.publishedAt,
        updatedAt: new Date().toISOString(),
        files: archive.files,
        descriptor,
        baseSnapshot: snapshot,
        batchId: archive.storage.batchId,
        sample: oldDraft?.sample,
      };
      await mkdir(path.join(draftFolder(id), "files"), {
        recursive: true,
        mode: 0o700,
      });
      for (const file of archive.files) {
        const data = (
          await bee.file.download(snapshot, file.path)
        ).data.toUint8Array();
        if (data.length !== file.size || hash(data) !== file.sha256)
          throw new Error(`Integrity check failed for ${file.name}.`);
        await writeFile(path.join(draftFolder(id), safePath(file.path)), data, {
          mode: 0o600,
        });
      }
      await saveDraft(draft);
      return response(draft);
    }
    if (resource === "storage" && method === "POST") {
      if (id === "quote")
        return response(
          await quoteStorage(
            z
              .object({
                action: z.enum(["buy", "renew"]),
                batchId: z.string().regex(REFERENCE).optional(),
                days: z.number().int().min(1).max(365),
                megabytes: z.number().int().min(1).max(10000),
              })
              .parse(await request.json()),
          ),
        );
      if (id === "execute")
        return response(
          await executeStorage(
            z.object({ quoteId: z.string().uuid() }).parse(await request.json())
              .quoteId,
          ),
        );
    }
    return response({ error: "This endpoint does not exist." }, 404);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Something went wrong.";
    const safe = message
      .replaceAll(ROOT, "[project]")
      .replace(/https?:\/\/[^\s)]+/g, "[endpoint]");
    return response(
      {
        error:
          error instanceof z.ZodError
            ? "Some fields are invalid. Check your input and try again."
            : safe.slice(0, 500),
      },
      (error as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 400,
    );
  }
}
