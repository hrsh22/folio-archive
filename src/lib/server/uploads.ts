import {
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
  rename,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import {
  MAX_ARCHIVE_BYTES,
  MAX_FILE_BYTES,
  MAX_FILES,
  safePath,
  type ArchiveFile,
} from "../archive-format";
import {
  RUNTIME,
  draftFolder,
  getDraft,
  hash,
  idPath,
  readJson,
  saveDraft,
  writeJson,
} from "./runtime";
import { CHUNK_BYTES, limitedBody } from "./access";

const inputSchema = z.object({
  name: z.string().min(1).max(240),
  type: z.string().max(200),
  size: z.number().int().min(0).max(MAX_FILE_BYTES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
type Upload = z.infer<typeof inputSchema> & {
  id: string;
  draftId: string;
  expires: number;
};
const folder = (id: string) => path.join(RUNTIME, "uploads", idPath(id));
export async function beginUpload(draftId: string, input: unknown) {
  const data = inputSchema.parse(input);
  safePath(data.name);
  const draft = await getDraft(draftId);
  if (
    draft.files.length >= MAX_FILES ||
    draft.files.reduce((n, f) => n + f.size, 0) + data.size > MAX_ARCHIVE_BYTES
  )
    throw new Error("Collection limit reached (200 files or 100 MB).");
  // Interrupted uploads expire; they never enter the published inventory.
  const directory = path.join(RUNTIME, "uploads");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const entries = await readdir(directory);
  let pending = 0;
  for (const id of entries) {
    const previous = await readJson<Upload>(
      path.join(folder(id), "upload.json"),
    ).catch(() => null);
    if (!previous || previous.expires < Date.now())
      await rm(folder(id), { recursive: true, force: true });
    else pending += previous.size;
  }
  if (pending + data.size > 2 * MAX_ARCHIVE_BYTES)
    throw new Error(
      "Too many unfinished uploads. Finish or cancel them before adding more files.",
    );
  const upload: Upload = {
    ...data,
    id: randomUUID(),
    draftId,
    expires: Date.now() + 24 * 60 * 60 * 1000,
  };
  await writeJson(path.join(folder(upload.id), "upload.json"), upload);
  return { id: upload.id, chunkBytes: CHUNK_BYTES };
}
export async function putUploadPart(
  draftId: string,
  id: string,
  part: string,
  request: Request,
) {
  const upload = await readJson<Upload>(path.join(folder(id), "upload.json"));
  if (upload.draftId !== draftId || upload.expires < Date.now())
    throw new Error("Upload expired or belongs to another collection.");
  if (!/^\d{1,3}$/.test(part)) throw new Error("Invalid upload part.");
  const index = Number(part),
    expected = Math.min(CHUNK_BYTES, upload.size - index * CHUNK_BYTES);
  if (
    expected < 0 ||
    index >= Math.max(1, Math.ceil(upload.size / CHUNK_BYTES))
  )
    throw new Error("Invalid upload part.");
  const bytes = await limitedBody(request, CHUNK_BYTES);
  if (bytes.length !== expected)
    throw new Error("Upload part is incomplete. Retry this part.");
  const target = path.join(folder(id), `${index}.part`);
  const existing = await readFile(target).catch(() => null);
  if (existing) {
    if (hash(existing) !== hash(bytes))
      throw new Error("This upload part already contains different bytes.");
  } else {
    const temp = `${target}.tmp`;
    await writeFile(temp, bytes, { mode: 0o600 });
    await rename(temp, target);
  }
  return { received: index, bytes: bytes.length };
}
export async function finishUpload(draftId: string, id: string) {
  const draft = await getDraft(draftId);
  // Idempotent even if the previous completion response was lost.
  if (draft.files.some((f) => f.id === id)) return draft;
  const upload = await readJson<Upload>(path.join(folder(id), "upload.json"));
  if (upload.draftId !== draftId || upload.expires < Date.now())
    throw new Error("Upload expired or belongs to another collection.");
  if (
    draft.files.length >= MAX_FILES ||
    draft.files.reduce((n, f) => n + f.size, 0) + upload.size >
      MAX_ARCHIVE_BYTES
  )
    throw new Error("Collection limit reached (200 files or 100 MB).");
  const pieces = [];
  for (let i = 0; i < Math.max(1, Math.ceil(upload.size / CHUNK_BYTES)); i++)
    pieces.push(await readFile(path.join(folder(id), `${i}.part`)));
  const bytes = Buffer.concat(pieces);
  if (bytes.length !== upload.size || hash(bytes) !== upload.sha256)
    throw new Error("Upload checksum mismatch. The file has not been added.");
  const ext =
    upload.name
      .split(".")
      .pop()!
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 12) || "bin";
  const file: ArchiveFile = {
    id,
    path: `files/${id}.${ext}`,
    name: safePath(upload.name),
    type: upload.type || "application/octet-stream",
    size: upload.size,
    sha256: upload.sha256,
    caption: "",
    source: "",
  };
  await mkdir(path.join(draftFolder(draftId), "files"), {
    recursive: true,
    mode: 0o700,
  });
  const target = path.join(draftFolder(draftId), file.path);
  await writeFile(`${target}.tmp`, bytes, { mode: 0o600 });
  await rename(`${target}.tmp`, target);
  draft.files.push(file);
  await saveDraft(draft);
  await rm(folder(id), { recursive: true, force: true });
  return draft;
}
export async function cancelUpload(draftId: string, id: string) {
  const upload = await readJson<Upload>(
    path.join(folder(id), "upload.json"),
  ).catch(() => null);
  if (upload && upload.draftId !== draftId)
    throw new Error("Upload belongs to another collection.");
  await rm(folder(id), { recursive: true, force: true });
  return { cancelled: true };
}
