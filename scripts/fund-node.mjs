// Run this yourself in an interactive terminal. The gift key is never written to disk.
import { spawn } from "node:child_process";
import { emitKeypressEvents } from "node:readline";
import { mkdir } from "node:fs/promises";
import path from "node:path";
if (!process.stdin.isTTY)
  throw new Error("Run this yourself in an interactive terminal.");
try {
  process.loadEnvFile(".env.local");
} catch {}
const response = await fetch("http://127.0.0.1:1633/addresses");
if (!response.ok) throw new Error("Start the local Bee node first.");
const { ethereum } = await response.json();
if (!/^0x[0-9a-f]{40}$/i.test(ethereum))
  throw new Error("Bee did not return a valid wallet address.");
console.log(`Destination: your local Bee wallet ${ethereum}`);
console.log(
  "This transfers the event gift wallet’s xBZZ and xDAI to your node. The CLI will ask you to confirm.",
);
process.stdout.write("Paste your event gift code (hidden), then press Enter: ");
emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
let secret = "";
await new Promise((resolve, reject) => {
  function input(str, key) {
    if (key?.ctrl && key.name === "c") {
      process.stdin.setRawMode(false);
      process.exit(130);
    }
    if (key?.name === "return") {
      process.stdin.removeListener("keypress", input);
      process.stdin.setRawMode(false);
      resolve();
    } else if (key?.name === "backspace") secret = secret.slice(0, -1);
    else if (str && !key?.ctrl) secret += str;
  }
  process.stdin.on("keypress", input);
});
console.log("");
if (!/^(0x)?[a-f0-9]{64}$/i.test(secret.trim()))
  throw new Error("The gift code must be a 32-byte hex key. Nothing was sent.");
const config = path.resolve(".runtime/swarm-cli");
await mkdir(config, { recursive: true, mode: 0o700 });
const child = spawn(
  path.resolve("node_modules/.bin/swarm-cli"),
  [
    "utility",
    "redeem",
    secret.trim(),
    "--target",
    ethereum,
    "--json-rpc-url",
    process.env.BEE_BLOCKCHAIN_RPC_ENDPOINT ||
      "https://xdai.fairdatasociety.org",
    "--config-folder",
    config,
  ],
  { stdio: "inherit" },
);
secret = "";
child.on("exit", (code) => {
  process.exit(code ?? 1);
});
