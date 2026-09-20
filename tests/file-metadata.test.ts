import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Draft } from "../src/lib/archive-format";

const original = process.cwd();
await mkdir(path.join(original, ".runtime", "tests"), { recursive: true });
const root = await mkdtemp(
  path.join(original, ".runtime", "tests", "metadata-"),
);
process.chdir(root);
const previousCloud = process.env.VERCEL;
const previousKeeper = process.env.FOLIO_KEEPER_URL;
delete process.env.VERCEL;
delete process.env.FOLIO_KEEPER_URL;
const { createDraft, getDraft, writeJson, draftFolder, state, hash } =
  await import("../src/lib/server/runtime");
const { initializeJobs } = await import("../src/lib/server/publish");
const { PATCH } = await import("../src/app/api/[...path]/route");
await initializeJobs();

after(async () => {
  process.chdir(original);
  if (previousCloud === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = previousCloud;
  if (previousKeeper === undefined) delete process.env.FOLIO_KEEPER_URL;
  else process.env.FOLIO_KEEPER_URL = previousKeeper;
  await rm(root, { recursive: true, force: true });
});

const publicMetadata = {
  name: "Folio 12 - recto.txt",
  caption: "Transcription checked against the original.",
  source: "Study collection, shelf mark 12. Reproduced with permission.",
};

async function fixture() {
  const draft = await createDraft("A deliberate public edition", "");
  draft.updatedAt = "2020-01-01T00:00:00.000Z";
  await mkdir(path.join(draftFolder(draft.id), "files"));
  for (const id of ["original", "second"]) {
    const bytes = Buffer.from(`Original bytes for ${id}.`);
    const file = {
      id,
      path: `files/${id}.txt`,
      name: `${id}.txt`,
      type: "text/plain",
      size: bytes.length,
      sha256: hash(bytes),
      caption: "",
      source: "",
    };
    draft.files.push(file);
    await writeFile(path.join(draftFolder(draft.id), file.path), bytes);
  }
  await writeJson(path.join(draftFolder(draft.id), "draft.json"), draft);
  return draft;
}

const patch = (
  draft: Draft,
  input: unknown,
  fileId = "original",
  headers: Record<string, string> = {},
) =>
  PATCH(
    new Request(
      `http://localhost:3000/api/drafts/${draft.id}/files/${fileId}`,
      {
        method: "PATCH",
        headers: {
          host: "localhost:3000",
          origin: "http://localhost:3000",
          "content-type": "application/json",
          "x-folio-session": state.token,
          ...headers,
        },
        body: JSON.stringify(input),
      },
    ),
    {
      params: Promise.resolve({
        path: ["drafts", draft.id, "files", fileId],
      }),
    },
  );

test("public file metadata edits preserve stored bytes and identifiers and advance the draft timestamp", async () => {
  const draft = await fixture();
  const result = await patch(draft, {
    ...publicMetadata,
    name: "  Cafe\u0301 folio.txt  ",
    caption: `  ${publicMetadata.caption}  `,
  });
  assert.equal(result.status, 200);
  const edited = (await result.json()) as Draft;
  assert.equal(edited.files[0].name, "Caf\u00e9 folio.txt");
  assert.equal(edited.files[0].caption, publicMetadata.caption);
  assert.equal(edited.files[0].source, publicMetadata.source);
  assert.ok(edited.updatedAt > draft.updatedAt);
  const { name, caption, source, ...immutable } = edited.files[0];
  const {
    name: oldName,
    caption: oldCaption,
    source: oldSource,
    ...originalImmutable
  } = draft.files[0];
  assert.deepEqual(immutable, originalImmutable);
  assert.deepEqual(edited.files[1], draft.files[1]);
  assert.equal(
    hash(await readFile(path.join(draftFolder(draft.id), immutable.path))),
    immutable.sha256,
  );
  assert.deepEqual(await getDraft(draft.id), edited);
});

test("invalid or immutable metadata fields reject the entire edit without changing the draft", async () => {
  const draft = await fixture();
  for (const input of [
    { ...publicMetadata, name: " " },
    { ...publicMetadata, name: "../private.txt" },
    { ...publicMetadata, name: "folder\\private.txt" },
    { ...publicMetadata, name: ".." },
    { ...publicMetadata, name: "folio\u0000.txt" },
    { ...publicMetadata, name: "a".repeat(241) },
    { ...publicMetadata, caption: "a".repeat(2001) },
    { ...publicMetadata, source: "a".repeat(2001) },
    { ...publicMetadata, path: "files/elsewhere.txt" },
    { ...publicMetadata, sha256: "aa".repeat(32) },
    { ...publicMetadata, id: "new-identity" },
    { ...publicMetadata, size: 0 },
    { ...publicMetadata, type: "text/html" },
    { ...publicMetadata, privateKey: "must-never-be-stored" },
    { name: publicMetadata.name },
  ]) {
    assert.equal((await patch(draft, input)).status, 400);
    assert.deepEqual(await getDraft(draft.id), draft);
  }
});

test("metadata edits require keeper authentication and same-origin access", async () => {
  const draft = await fixture();
  assert.equal(
    (
      await patch(draft, publicMetadata, "original", {
        "x-folio-session": "wrong",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await patch(draft, publicMetadata, "original", {
        origin: "https://other.example",
      })
    ).status,
    403,
  );
  assert.deepEqual(await getDraft(draft.id), draft);
});

test("missing files return 404 and active publication prevents metadata from changing mid-edition", async () => {
  const draft = await fixture();
  assert.equal((await patch(draft, publicMetadata, "absent")).status, 404);
  const job = {
    id: "metadata-test-job",
    draftId: draft.id,
    status: "running" as const,
    step: "Publishing",
    progress: 30,
  };
  state.jobs.set(job.id, job);
  try {
    const result = await patch(draft, publicMetadata);
    assert.equal(result.status, 400);
    assert.match((await result.json()).error, /being published/);
    assert.deepEqual(await getDraft(draft.id), draft);
  } finally {
    state.jobs.delete(job.id);
  }
});

test("concurrent file metadata edits use the shared draft mutation queue without losing either edit", async () => {
  const draft = await fixture();
  const results = await Promise.all([
    patch(draft, publicMetadata),
    patch(draft, { ...publicMetadata, name: "Second folio.txt" }, "second"),
  ]);
  assert.deepEqual(
    results.map((result) => result.status),
    [200, 200],
  );
  const saved = await getDraft(draft.id);
  assert.equal(saved.files[0].name, publicMetadata.name);
  assert.equal(saved.files[1].name, "Second folio.txt");
  assert.equal(saved.files[0].source, publicMetadata.source);
  assert.equal(saved.files[1].source, publicMetadata.source);
});
