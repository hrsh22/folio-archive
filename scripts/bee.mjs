import { mkdir, writeFile, readFile, chmod, stat } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtime = path.join(root, ".runtime", "bee");
const binary = path.join(
  runtime,
  "bin",
  process.platform === "win32" ? "bee.exe" : "bee",
);
const version = "2.8.2";
const command = process.argv[2];
if (process.loadEnvFile) {
  try {
    process.loadEnvFile(path.join(root, ".env.local"));
  } catch {}
}

if (command === "install") {
  const platform = { darwin: "darwin", linux: "linux", win32: "windows" }[
    process.platform
  ];
  const architecture = { arm64: "arm64", x64: "amd64" }[process.arch];
  if (!platform || !architecture)
    throw new Error(
      "This installer supports macOS/Linux arm64 or x64. See the official Bee releases for other systems.",
    );
  const releaseResponse = await fetch(
    `https://api.github.com/repos/ethersphere/bee/releases/tags/v${version}`,
  );
  if (!releaseResponse.ok)
    throw new Error(`Release lookup failed: ${releaseResponse.status}`);
  const release = await releaseResponse.json();
  const name = `bee-${platform}-${architecture}${platform === "windows" ? ".exe" : ""}`;
  const asset = release.assets.find((item) => item.name === name);
  if (!asset?.digest?.startsWith("sha256:"))
    throw new Error(
      "No matching release asset with an official SHA-256 digest.",
    );
  console.log(
    `Downloading official Bee ${version} for ${platform}/${architecture}…`,
  );
  const response = await fetch(asset.browser_download_url);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  if (digest !== asset.digest)
    throw new Error("Bee download checksum mismatch. Refusing to install.");
  await mkdir(path.dirname(binary), { recursive: true, mode: 0o700 });
  await writeFile(binary, bytes, { mode: 0o700 });
  await chmod(binary, 0o700);
  await writeFile(
    path.join(runtime, "release.json"),
    JSON.stringify(
      { version, source: asset.browser_download_url, digest },
      null,
      2,
    ),
  );
  console.log("Bee installed and checksum verified inside .runtime/bee/bin.");
} else if (command === "start") {
  await stat(binary).catch(() => {
    throw new Error("Run npm run bee:install first.");
  });
  await mkdir(path.join(runtime, "data"), { recursive: true, mode: 0o700 });
  const passwordPath = path.join(runtime, "password");
  try {
    await readFile(passwordPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await writeFile(passwordPath, randomBytes(32).toString("hex"), {
      mode: 0o600,
      flag: "wx",
    });
  }
  const rpc = process.env.BEE_BLOCKCHAIN_RPC_ENDPOINT;
  const args = [
    "start",
    "--data-dir",
    path.join(runtime, "data"),
    "--password-file",
    passwordPath,
    "--api-addr",
    "127.0.0.1:1633",
    "--p2p-addr",
    ":1634",
    "--cache-capacity",
    "250000",
    "--full-node=false",
    `--swap-enable=${Boolean(rpc)}`,
    `--chequebook-enable=${Boolean(rpc)}`,
    "--verbosity",
    "info",
  ];
  if (rpc) args.push("--blockchain-rpc-endpoint", rpc);
  console.log(
    rpc
      ? "Starting Bee in light configuration; node funding and chain sync determine readiness."
      : "Starting Bee in read-only ultra-light mode. Configure a Gnosis RPC and fund the node to upload.",
  );
  const child = spawn(binary, args, { stdio: "inherit", cwd: root });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => child.kill(signal));
  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
} else if (command === "status") {
  for (const endpoint of ["health", "node", "addresses"]) {
    const response = await fetch(`http://127.0.0.1:1633/${endpoint}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`${endpoint}: HTTP ${response.status}`);
    const data = await response.json();
    const safe =
      endpoint === "addresses"
        ? { ethereum: data.ethereum, overlay: data.overlay }
        : data;
    console.log(endpoint, JSON.stringify(safe));
  }
} else {
  console.log("Usage: node scripts/bee.mjs install|start|status");
}
