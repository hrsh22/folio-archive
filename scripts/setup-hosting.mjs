import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const root = process.cwd(),
  folder = path.join(root, ".runtime", "hosting");
await mkdir(folder, { recursive: true, mode: 0o700 });
let environment = await readFile(path.join(root, ".env.local"), "utf8").catch(
  () => "",
);
for (const name of ["FOLIO_BRIDGE_KEY", "FOLIO_OWNER_KEY"]) {
  let value = environment
    .match(new RegExp(`^${name}=(.+)$`, "m"))?.[1]
    ?.trim()
    .replace(/^(['"])(.*)\1$/, "$2");
  if (!value) {
    value = randomBytes(32).toString("hex");
    environment += `\n${name}=${value}\n`;
  }
  await writeFile(path.join(folder, `${name}.txt`), value, { mode: 0o600 });
}
await writeFile(path.join(root, ".env.local"), environment, { mode: 0o600 });
console.log(
  "Hosting keys are ready in .runtime/hosting (ignored by Git and Vercel). No keys were printed. Restart the local app to load them.",
);
