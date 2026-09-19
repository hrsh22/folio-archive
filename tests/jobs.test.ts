import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
const original = process.cwd();
await mkdir(path.join(original, ".runtime", "tests"), { recursive: true });
const root = await mkdtemp(path.join(original, ".runtime", "tests", "jobs-"));
process.chdir(root);
const { writeJson, readJson, RUNTIME, state } =
  await import("../src/lib/server/runtime");
const { initializeJobs, getPublication, reconcilePublication } =
  await import("../src/lib/server/publish");
test("restart retains completed jobs and marks interrupted work for network reconciliation without signing again", async () => {
  try {
    const running = {
      id: "11111111-1111-4111-8111-111111111111",
      draftId: "22222222-2222-4222-8222-222222222222",
      status: "running",
      step: "Updating the feed",
      progress: 85,
    };
    const complete = {
      ...running,
      id: "33333333-3333-4333-8333-333333333333",
      status: "complete",
      progress: 100,
    };
    await writeJson(path.join(RUNTIME, "jobs", `${running.id}.json`), running);
    await writeJson(
      path.join(RUNTIME, "jobs", `${complete.id}.json`),
      complete,
    );
    await initializeJobs();
    assert.equal((await getPublication(running.id))?.status, "failed");
    assert.match(
      (await getPublication(running.id))?.error || "",
      /interrupted/,
    );
    assert.equal((await getPublication(complete.id))?.status, "complete");
    assert.equal(
      (
        await readJson<{ status: string }>(
          path.join(RUNTIME, "jobs", `${running.id}.json`),
        )
      ).status,
      "failed",
    );
    await assert.rejects(
      reconcilePublication(running.id),
      /did not reach its feed write/,
    );
    assert.equal(state.jobs.size, 2);
  } finally {
    process.chdir(original);
    await rm(root, { recursive: true, force: true });
  }
});
