import { mkdir, writeFile, rename, readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { recoverArchive } from "../src/lib/recovery";
import { descriptorSchema, safePath } from "../src/lib/archive-format";

const { values } = parseArgs({
  options: {
    archive: { type: "string" },
    descriptor: { type: "string" },
    endpoint: { type: "string", default: "https://api.gateway.ethswarm.org" },
    out: { type: "string" },
    "verify-only": { type: "boolean", default: false },
    help: { type: "boolean" },
  },
});
if (values.help || (!values.archive && !values.descriptor)) {
  console.log(
    "Usage: npm run recover -- --archive <public-link-or-reference> [--endpoint <Bee-url>] [--out <new-folder>]\n       npm run verify:archive -- --descriptor evidence/archives/<id>.json\nNo publisher credentials or local catalogue are read. All output stays inside this project.",
  );
  process.exit(values.help ? 0 : 1);
}
let staging: string | undefined;
try {
  const input =
    values.archive ||
    descriptorSchema.parse(
      JSON.parse(await readFile(values.descriptor!, "utf8")),
    ).manifestReference;
  const root = process.cwd();
  const output = path.resolve(
    root,
    values.out || `.runtime/recovered/${Date.now()}`,
  );
  if (!output.startsWith(root + path.sep))
    throw new Error("Choose a new output folder inside this project.");
  if (!values["verify-only"]) {
    // Claim a new directory exclusively; never overwrite someone's files or
    // follow existing symlinks inside a previous recovery directory.
    await mkdir(path.dirname(output), { recursive: true });
    await mkdir(output);
    staging = path.join(output, `.incomplete-${randomUUID()}`);
    await mkdir(staging);
  }
  const result = await recoverArchive(
    input,
    values.endpoint!,
    staging
      ? async (file, bytes) => {
          const destination = path.join(staging!, safePath(file.path));
          await mkdir(path.dirname(destination), { recursive: true });
          await writeFile(destination, bytes, { flag: "wx" });
          console.log(`Verified ${file.name} (${bytes.length} bytes)`);
        }
      : undefined,
  );
  if (staging) {
    await writeFile(
      path.join(staging, "archive.json"),
      JSON.stringify(result.archive, null, 2) + "\n",
      { flag: "wx" },
    );
    await writeFile(
      path.join(staging, "bootstrap.json"),
      JSON.stringify(result.descriptor, null, 2) + "\n",
      { flag: "wx" },
    );
    await writeFile(
      path.join(staging, "recovery-report.json"),
      JSON.stringify(result.report, null, 2) + "\n",
      { flag: "wx" },
    );
    await rename(staging, path.join(output, "complete"));
  }
  console.log(JSON.stringify(result.report, null, 2));
  if (staging)
    console.log(`Complete archive: ${path.join(output, "complete")}`);
} catch (error) {
  console.error(`Recovery incomplete: ${(error as Error).message}`);
  if (staging)
    console.error(
      `Partial files are labelled incomplete in ${staging}. No completion report was issued.`,
    );
  process.exitCode = 1;
}
