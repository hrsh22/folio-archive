import { execFileSync } from "node:child_process";
import { readFile, readdir, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
const files = process.argv.includes("--deployment")
  ? JSON.parse(
      await readFile(".runtime/hosting/deployment-inputs.json", "utf8"),
    ).files.map((f) => f.path)
  : execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { encoding: "utf8" },
    )
      .split("\0")
      .filter(Boolean);
const known = [];
const env = await readFile(".env.local", "utf8").catch(() => "");
for (const line of env.split("\n")) {
  const match = line.match(
    /^([A-Z0-9_]*(?:KEY|TOKEN|PASSWORD|SECRET)[A-Z0-9_]*)=(.+)$/,
  );
  if (match) {
    const value = match[2].replace(/^['"]|['"]$/g, "").trim();
    if (value.length >= 16) known.push(value);
  }
}
for (const name of await readdir(".runtime/folio/keys").catch(() => [])) {
  const value = (
    await readFile(path.join(".runtime/folio/keys", name), "utf8")
  ).trim();
  if (value.length >= 16) known.push(value);
}
const beePassword = (
  await readFile(".runtime/bee/password", "utf8").catch(() => "")
).trim();
if (beePassword.length >= 16) known.push(beePassword);
const failures = [];
let checked = 0;
for (const file of files) {
  if (!(await stat(file).catch(() => null))?.isFile()) continue;
  checked++;
  if (
    (/(^|\/)\.env(\.|$)/.test(file) && file !== ".env.example") ||
    /(^|\/)(\.runtime|\.vercel)(\/|$)/.test(file)
  ) {
    failures.push({ file, reason: "private path" });
    continue;
  }
  const data = await readFile(file, "utf8");
  if (known.some((secret) => data.includes(secret)))
    failures.push({ file, reason: "known local credential" });
  if (
    /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(
      data,
    )
  )
    failures.push({ file, reason: "credential pattern" });
  if (/https?:\/\/[^\s/]+:[^\s/@]+@/.test(data))
    failures.push({ file, reason: "credential-bearing URL" });
}
const result = {
  observedAt: new Date().toISOString(),
  scope: process.argv.includes("--deployment")
    ? "Vercel source inputs"
    : "Git candidate files",
  filesChecked: checked,
  knownCredentialsChecked: known.length,
  passed: failures.length === 0,
  failures,
  limitations:
    "Pattern checks plus exact matching against local credentials; not a guarantee against every possible secret format.",
};
console.log(JSON.stringify(result, null, 2));
if (process.argv.includes("--record")) {
  await mkdir("evidence/checks", { recursive: true });
  await writeFile(
    "evidence/checks/secret-scan.json",
    JSON.stringify(result, null, 2) + "\n",
  );
}
if (failures.length) process.exit(1);
