import { mkdir, cp, rm, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Topic } from "@ethersphere/bee-js";
import {
  archiveSchema,
  type Archive,
  type Descriptor,
  type PublishJob,
  type PublishedArchive,
} from "../archive-format";
import { makeBee, readSnapshot, isMissingFeed } from "../network";
import {
  BEE_URL,
  VERIFY_URL,
  ROOT,
  RUNTIME,
  state,
  getDraft,
  draftFolder,
  saveDraft,
  publisherKey,
  hash,
  writeJson,
  savePublished,
  listPublished,
  readJson,
} from "./runtime";
import { nodeStatus } from "./node-status";
import { appendReference } from "./feed-update";
import { retryNetworkVerification } from "./verification-retry";

const jobPath = (id: string) => path.join(RUNTIME, "jobs", `${id}.json`);
let initialized: Promise<void> | undefined;
export function initializeJobs() {
  return (initialized ??= (async () => {
    await mkdir(path.join(RUNTIME, "jobs"), { recursive: true, mode: 0o700 });
    for (const name of await readdir(path.join(RUNTIME, "jobs"))) {
      if (!name.endsWith(".json") || name.endsWith(".pending.json")) continue;
      const job = await readJson<PublishJob>(path.join(RUNTIME, "jobs", name));
      if (job.status === "running") {
        job.status = "failed";
        job.step = "Publisher restarted";
        job.error =
          "Publishing was interrupted. Recheck the network before retrying; a feed write may already have succeeded.";
        await writeJson(jobPath(job.id), job);
      }
      state.jobs.set(job.id, job);
    }
  })());
}
export async function getPublication(id: string) {
  await initializeJobs();
  return state.jobs.get(id);
}
async function publicationLock() {
  const lock = path.join(RUNTIME, "publish.lock");
  await mkdir(RUNTIME, { recursive: true, mode: 0o700 });
  try {
    await mkdir(lock);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const owner = await readJson<{ pid: number }>(
      path.join(lock, "owner.json"),
    ).catch(() => null);
    if (!owner)
      throw new Error(
        "A publication lock has no owner record. Inspect it before removing it.",
      );
    let alive = true;
    try {
      process.kill(owner.pid, 0);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ESRCH") alive = false;
    }
    if (alive)
      throw new Error(
        "Another publisher is still running. Wait for it to finish.",
      );
    await rm(lock, { recursive: true, force: true });
    await mkdir(lock);
  }
  await writeJson(path.join(lock, "owner.json"), {
    pid: process.pid,
    createdAt: new Date().toISOString(),
  });
  return lock;
}
type PendingPublication = {
  result: PublishedArchive;
  archive: Archive;
  previousSnapshot: string | null;
  batch: Awaited<ReturnType<typeof nodeStatus>>["batches"][number];
  node: { mode: string; version?: string; peers: number; wallet?: string };
};
export async function reconcilePublication(id: string) {
  const job = await getPublication(id);
  if (!job) throw new Error("Publication not found.");
  if (job.status === "complete" || job.status === "running") return job;
  const pending = await readJson<PendingPublication>(
    path.join(RUNTIME, "jobs", `${id}.pending.json`),
  ).catch(() => null);
  if (!pending)
    throw new Error(
      "The interrupted job did not reach its feed write. It is safe to publish again.",
    );
  const remote = await readSnapshot(
    makeBee(VERIFY_URL),
    pending.result.descriptor,
  );
  if (remote.snapshot !== pending.result.snapshot)
    throw new Error(
      "This edition is not the latest public feed value. Restore the published edition before retrying if the feed changed.",
    );
  const files = await verifySnapshot(
    pending.result.snapshot,
    pending.archive,
    job,
  );
  await savePublished(pending.result);
  const draft = await getDraft(job.draftId);
  // Do not mark unsaved edits as based on a new edition. Editing stays explicit.
  if (
    JSON.stringify(draft.files) === JSON.stringify(pending.archive.files) &&
    draft.title === pending.archive.title &&
    draft.description === pending.archive.description
  ) {
    draft.baseSnapshot = pending.result.snapshot;
    await saveDraft(draft);
  }
  await writeJson(path.join(ROOT, "evidence", "runs", `${id}.json`), {
    kind: "live-publication-reconciled",
    observedAt: new Date().toISOString(),
    descriptor: pending.result.descriptor,
    snapshot: pending.result.snapshot,
    previousSnapshot: pending.previousSnapshot,
    feedIndex: remote.feedIndex,
    node: pending.node,
    storage: pending.batch,
    verificationEndpoint: new URL(VERIFY_URL).origin,
    files,
    complete: true,
  });
  Object.assign(job, {
    status: "complete",
    step: "Published and independently verified",
    progress: 100,
    error: undefined,
    result: pending.result,
  });
  await writeJson(jobPath(id), job);
  return job;
}
export function draftBusy(id: string) {
  return [...state.jobs.values()].some(
    (j) => j.draftId === id && j.status === "running",
  );
}
export async function startPublication(draftId: string, batchId: string) {
  await initializeJobs();
  if ([...state.jobs.values()].some((j) => j.status === "running"))
    throw new Error(
      "A publication is already in progress. Wait for it to finish.",
    );
  const job: PublishJob = {
    id: randomUUID(),
    startedAt: new Date().toISOString(),
    draftId,
    status: "running",
    step: "Checking your node and storage",
    progress: 3,
  };
  state.jobs.set(job.id, job);
  await writeJson(jobPath(job.id), job);
  void publish(job, batchId)
    .catch((error) => {
      job.status = "failed";
      job.error = publicError(error);
      job.step = "Publication needs attention";
    })
    .finally(async () => {
      await writeJson(jobPath(job.id), job);
    })
    .catch(() => {
      // A disk failure must not crash a running keeper or replay a signed write.
      job.error =
        "Could not persist the job receipt. Check the public archive before retrying.";
    });
  return job;
}
function publicError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Publication failed.";
  return message
    .replace(/https?:\/\/[^\s)]+/g, "[endpoint]")
    .replaceAll(ROOT, "[project]")
    .slice(0, 500);
}
async function verifySnapshot(
  snapshot: string,
  archive: Archive,
  job: PublishJob,
) {
  if (new URL(BEE_URL).origin === new URL(VERIFY_URL).origin)
    throw new Error(
      "Verification must use an endpoint independent of the publishing node.",
    );
  const remote = makeBee(VERIFY_URL);
  return retryNetworkVerification(
    async (signal) => {
      const inventory = await remote.file.download(
        snapshot,
        "archive.json",
        undefined,
        { signal },
      );
      const parsed = archiveSchema.parse(inventory.data.toJSON());
      if (JSON.stringify(parsed) !== JSON.stringify(archive))
        throw new Error(
          "The retrieved inventory differs from the publication.",
        );
      const results = [];
      for (const [index, file] of archive.files.entries()) {
        job.step = `Verifying file ${index + 1} of ${archive.files.length} through another endpoint`;
        const result = await remote.file.download(
          snapshot,
          file.path,
          undefined,
          { signal },
        );
        if (
          result.data.length !== file.size ||
          hash(result.data.toUint8Array()) !== file.sha256
        )
          throw new Error(`Integrity check failed for ${file.name}.`);
        results.push({
          path: file.path,
          bytes: file.size,
          sha256: file.sha256,
          verified: true,
        });
      }
      return results;
    },
    () => {
      job.step = "Waiting for the archive to become retrievable on the network";
    },
  );
}
async function publish(job: PublishJob, batchId: string) {
  const lock = await publicationLock();
  const stage = path.join(RUNTIME, "staging", job.id);
  try {
    const status = await nodeStatus();
    if (!status.ready) throw new Error(status.message);
    const batch = status.batches.find(
      (b) => b.id === batchId && b.usable && b.immutable,
    );
    if (!batch || batch.remainingSeconds <= 0)
      throw new Error("Select a usable, unexpired immutable storage batch.");
    const draft = await getDraft(job.draftId);
    const existing = (await listPublished()).find((a) => a.id === draft.id);
    if (
      (existing?.batchId || draft.batchId) &&
      (existing?.batchId || draft.batchId) !== batchId
    )
      throw new Error(
        "Keep this archive on its original batch and renew that batch. Its stable manifest depends on the original postage.",
      );
    if (!draft.files.length)
      throw new Error("Add at least one file before publishing.");
    const bytes = draft.files.reduce((n, f) => n + f.size, 0);
    if (batch.remainingBytes < bytes * 1.5 + 2 * 1024 * 1024)
      throw new Error(
        "This batch has insufficient capacity for the archive and its metadata.",
      );
    const bee = makeBee(BEE_URL);
    const key = await publisherKey(draft.id);
    const owner = key.publicKey().address().toHex();
    const topic = Topic.fromString(`folio.archive.${draft.id}`).toHex();
    let descriptor: Descriptor | undefined = draft.descriptor;
    let previousSnapshot: string | null = null;
    if (descriptor) {
      if (descriptor.owner !== owner || descriptor.topic !== topic)
        throw new Error(
          "Publisher key does not match the archive's public address.",
        );
      try {
        previousSnapshot = (await readSnapshot(bee, descriptor)).snapshot;
      } catch (error) {
        if (!isMissingFeed(error) || draft.baseSnapshot) throw error;
      }
      if (draft.baseSnapshot && draft.baseSnapshot !== previousSnapshot)
        throw new Error(
          "A newer version exists. Open the published archive and create a fresh editing draft.",
        );
    } else {
      job.step = "Creating your stable archive address";
      job.progress = 10;
      const manifest = await bee.feed.createManifest(batchId, topic, owner, {
        deferred: false,
      });
      descriptor = {
        format: "folio.archive-address",
        version: 1,
        archiveId: draft.id,
        owner,
        topic,
        manifestReference: manifest.toHex(),
      };
      draft.descriptor = descriptor;
      draft.batchId = batchId;
      await saveDraft(draft);
    }
    const archive = archiveSchema.parse({
      format: "folio.archive",
      version: 1,
      archiveId: draft.id,
      title: draft.title,
      description: draft.description,
      publishedAt: new Date().toISOString(),
      previousSnapshot,
      files: draft.files,
      storage: {
        batchId,
        observedAt: status.observedAt,
        remainingSeconds: batch.remainingSeconds,
      },
    });
    await mkdir(stage, { recursive: true, mode: 0o700 });
    await cp(
      path.join(draftFolder(draft.id), "files"),
      path.join(stage, "files"),
      { recursive: true },
    );
    await cp(path.join(ROOT, "public", "reader"), stage, { recursive: true });
    await writeJson(path.join(stage, "archive.json"), archive);
    await writeJson(path.join(stage, "bootstrap.json"), descriptor);
    job.step = "Publishing the complete collection to Swarm";
    job.progress = 25;
    const upload = await bee.collection.uploadFromDirectory(batchId, stage, {
      indexDocument: "index.html",
      deferred: false,
      pin: true,
    });
    const snapshot = upload.reference.toHex();
    job.progress = 60;
    const files = await verifySnapshot(snapshot, archive, job);
    const result: PublishedArchive = {
      id: draft.id,
      title: draft.title,
      descriptor,
      snapshot,
      publishedAt: archive.publishedAt,
      batchId,
      fileCount: files.length,
      totalBytes: bytes,
    };
    // Persist the exact proposed reference before signing; restart recovery only reads it.
    await writeJson(path.join(RUNTIME, "jobs", `${job.id}.pending.json`), {
      result,
      archive,
      previousSnapshot,
      batch,
      node: {
        mode: status.mode,
        version: status.version,
        peers: status.peers,
        wallet: status.wallet,
      },
    } satisfies PendingPublication);
    job.step = "Updating your stable address";
    job.progress = 85;
    const index = await appendReference(
      bee.feed.makeWriter(topic, key),
      batchId,
      snapshot,
      previousSnapshot,
    );
    job.step = "Checking the public address";
    job.progress = 95;
    let verified = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        verified =
          (await readSnapshot(makeBee(VERIFY_URL), descriptor)).snapshot ===
          snapshot;
      } catch {}
      if (verified) break;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    if (!verified)
      throw new Error(
        "The feed update was sent, but its public read is not confirmed yet. Keep your archive address and retry verification before claiming success.",
      );
    await savePublished(result);
    draft.baseSnapshot = snapshot;
    await saveDraft(draft);
    await writeJson(path.join(ROOT, "evidence", "runs", `${job.id}.json`), {
      kind: "live-publication",
      observedAt: new Date().toISOString(),
      descriptor,
      snapshot,
      previousSnapshot,
      feedIndex: index,
      node: {
        mode: status.mode,
        version: status.version,
        peers: status.peers,
        wallet: status.wallet,
      },
      storage: batch,
      verificationEndpoint: new URL(VERIFY_URL).origin,
      files,
      complete: true,
    });
    job.result = result;
    job.progress = 100;
    job.step = "Published and independently verified";
    job.status = "complete";
  } finally {
    await rm(stage, { recursive: true, force: true });
    await rm(lock, { recursive: true, force: true });
  }
}
