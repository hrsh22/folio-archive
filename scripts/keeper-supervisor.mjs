import { spawn } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const folder = path.join(root, ".runtime", "services");
mkdirSync(folder, { recursive: true, mode: 0o700 });
process.chdir(root);
process.umask(0o077);
const statusPath = path.join(folder, "status.json");
const lockPath = path.join(folder, "keeper.pid");
const alive = (pid) => {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
};
if (process.argv.includes("--status")) {
  const saved = existsSync(statusPath)
    ? JSON.parse(readFileSync(statusPath, "utf8"))
    : null;
  const running = Boolean(
    saved &&
    alive(saved.pid) &&
    saved.status !== "stopped" &&
    Date.now() - Date.parse(saved.observedAt) < 90000,
  );
  console.log(JSON.stringify({ running, lastSession: saved }, null, 2));
  process.exit(0);
}
if (process.argv.length > 2) {
  console.error("Usage: npm run keeper:start | npm run keeper:status");
  process.exit(1);
}
for (const name of [
  ".next/BUILD_ID",
  ".runtime/bee/bin/bee",
  ".runtime/hosting/bin/cloudflared",
  ".runtime/hosting/FOLIO_BRIDGE_KEY.txt",
  ".vercel/project.json",
]) {
  if (!existsSync(path.join(root, name))) {
    console.error(
      `Missing ${name}. Complete the setup in docs/HOSTING.md first.`,
    );
    process.exit(1);
  }
}
if (existsSync(lockPath)) {
  if (alive(Number(readFileSync(lockPath, "utf8")))) {
    console.error(
      "Folio is already running. Stop it with Ctrl+C in its terminal first.",
    );
    process.exit(1);
  }
  unlinkSync(lockPath);
}
writeFileSync(lockPath, String(process.pid), { flag: "wx" });
process.on("exit", () => {
  if (
    existsSync(lockPath) &&
    readFileSync(lockPath, "utf8") === String(process.pid)
  )
    unlinkSync(lockPath);
});
for (const port of [3000, 1633]) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", () =>
      reject(
        new Error(
          `Port ${port} is already in use. Stop the existing local app or Bee before starting Folio.`,
        ),
      ),
    );
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
}
const settingsPath = path.join(folder, "settings.json");
if (!existsSync(settingsPath))
  writeFileSync(
    settingsPath,
    JSON.stringify(
      {
        appUrl: "https://folio-archive.vercel.app",
      },
      null,
      2,
    ),
  );
const config = JSON.parse(readFileSync(settingsPath, "utf8"));
const appUrl = new URL(config.appUrl);
if (
  appUrl.protocol !== "https:" ||
  appUrl.username ||
  appUrl.password ||
  appUrl.search ||
  appUrl.hash
)
  throw new Error(
    "Set appUrl to your public HTTPS app origin in .runtime/services/settings.json.",
  );
config.appUrl = appUrl.origin;
console.log("Starting Bee, the keeper, and a local Cloudflare tunnel.");
console.log(
  "Keep this terminal open. Ctrl+C stops all three. Nothing starts at login or prevents sleep.",
);
console.log(
  "A new tunnel address is connected to the existing Vercel deployment automatically; this can take a few minutes.",
);
const children = new Map(),
  timers = new Set();
const state = {
  pid: process.pid,
  startedAt: new Date().toISOString(),
  status: "running",
  children: {},
  tunnelUrl: null,
  connection: { status: "waiting" },
};
let stopping = false,
  syncing = false,
  retryAt = 0,
  failures = 0;
const log = (name, data) => {
  const file = path.join(folder, `${name}.log`);
  if (existsSync(file) && statSync(file).size > 10 * 1024 * 1024)
    renameSync(file, `${file}.previous`);
  appendFileSync(file, data, { mode: 0o600 });
};
function save() {
  const temp = path.join(folder, "status.json.tmp");
  writeFileSync(
    temp,
    JSON.stringify({ ...state, observedAt: new Date().toISOString() }, null, 2),
  );
  renameSync(temp, path.join(folder, "status.json"));
}
function later(action, ms) {
  const timer = setTimeout(() => {
    timers.delete(timer);
    if (!stopping) action();
  }, ms);
  timers.add(timer);
}
function signalChild(child, signal) {
  if (!child.pid) return;
  try {
    // Include Bee's native process and the Vercel CLI's descendants in shutdown.
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}
function supervise(name, executable, args, onData) {
  let attempts = 0;
  function start() {
    if (stopping) return;
    const started = Date.now();
    const child = spawn(executable, args, {
      cwd: root,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.set(name, child);
    state.children[name] = {
      pid: child.pid,
      startedAt: new Date().toISOString(),
      restarts: attempts++,
      status: "running",
    };
    save();
    for (const stream of [child.stdout, child.stderr])
      stream.on("data", (data) => {
        log(name, data);
        onData?.(String(data));
      });
    child.on("error", () =>
      log(
        name,
        "Could not start process. Check the installed binary and permissions.\n",
      ),
    );
    child.on("exit", () => signalChild(child, "SIGTERM"));
    child.on("close", (code, signal) => {
      children.delete(name);
      state.children[name] = {
        ...state.children[name],
        pid: null,
        status: stopping ? "stopped" : "restarting",
        exitCode: code,
        signal,
      };
      if (name === "tunnel") {
        tail = "";
        state.tunnelUrl = null;
        state.connection.status = "waiting";
      }
      save();
      if (!stopping)
        console.log(
          `${name} stopped. Restarting it for this terminal session.`,
        );
      if (!stopping)
        later(
          start,
          Date.now() - started > 60000
            ? 2000
            : Math.min(60000, 2000 * Math.max(1, attempts)),
        );
    });
  }
  start();
}
let tail = "";
supervise("bee", process.execPath, ["scripts/bee.mjs", "start"]);
supervise("keeper", process.execPath, [
  "node_modules/next/dist/bin/next",
  "start",
  "--hostname",
  "127.0.0.1",
]);
supervise(
  "tunnel",
  path.join(root, ".runtime/hosting/bin/cloudflared"),
  ["tunnel", "--url", "http://127.0.0.1:3000", "--no-autoupdate"],
  (data) => {
    tail = (tail + data).slice(-16384);
    const match = tail.match(
      /https:\/\/[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com\b/,
    );
    if (match && state.tunnelUrl !== match[0]) {
      state.tunnelUrl = match[0];
      tail = "";
      retryAt = 0;
      failures = 0;
      writeFileSync(
        path.join(root, ".runtime/hosting/FOLIO_KEEPER_URL.txt"),
        match[0],
      );
      save();
      console.log(`Local tunnel ready: ${match[0]}`);
    }
  },
);
function vercel(args, input) {
  return new Promise((resolve, reject) => {
    // No token is copied into this project. The CLI uses the owner's existing login.
    const child = spawn(
      process.execPath,
      [
        path.join(
          path.dirname(process.execPath),
          "../lib/node_modules/npm/bin/npm-cli.js",
        ),
        "exec",
        "--yes",
        "--package=vercel@59.23.2",
        "--",
        "vercel",
        ...args,
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          npm_config_cache: path.join(root, ".runtime/npm-cache"),
        },
        detached: process.platform !== "win32",
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    children.set("connection", child);
    const timeout = setTimeout(() => signalChild(child, "SIGTERM"), 12 * 60000);
    for (const stream of [child.stdout, child.stderr])
      stream.on("data", (data) => log("connection", data));
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timeout);
      children.delete("connection");
      code === 0
        ? resolve()
        : reject(
            new Error(
              "Vercel connection update failed. Check .runtime/services/connection.log and the Vercel CLI login.",
            ),
          );
    });
    child.stdin.end(input);
  });
}
async function syncConnection() {
  if (stopping || syncing || !state.tunnelUrl || Date.now() < retryAt) return;
  const origin = state.tunnelUrl;
  const stamp = path.join(folder, "connected-url.txt");
  const previous = existsSync(stamp) ? readFileSync(stamp, "utf8").trim() : "";
  if (origin === previous) {
    state.connection.status = "connected";
    return;
  }
  syncing = true;
  try {
    // The tunnel must reach our authenticated bridge before it is advertised.
    const key = readFileSync(
      path.join(root, ".runtime/hosting/FOLIO_BRIDGE_KEY.txt"),
      "utf8",
    ).trim();
    const r = await fetch(`${origin}/api/node`, {
      headers: { authorization: `Bearer ${key}` },
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error("The new tunnel is not ready yet.");
    const value = await r.json();
    if (typeof value.online !== "boolean" || typeof value.mode !== "string")
      throw new Error("Unexpected bridge response.");
    state.connection = {
      status: "updating",
      startedAt: new Date().toISOString(),
    };
    save();
    console.log("Connecting the new tunnel to Vercel...");
    await vercel(
      ["env", "update", "FOLIO_KEEPER_URL", "production", "--yes"],
      origin,
    );
    if (stopping || state.tunnelUrl !== origin)
      throw new Error("Tunnel changed during connection repair.");
    // Redeploy the existing production source. Never publish uncommitted local edits.
    await vercel(["redeploy", config.appUrl, "--target", "production"]);
    if (state.tunnelUrl !== origin)
      throw new Error("Tunnel changed during deployment.");
    writeFileSync(stamp, origin);
    state.connection = {
      status: "connected",
      connectedAt: new Date().toISOString(),
    };
    failures = 0;
    console.log(
      `Connected: ${config.appUrl}/manage. Ctrl+C disconnects the keeper.`,
    );
  } catch (error) {
    state.connection = {
      status: "retrying",
      message: error.message,
      failedAt: new Date().toISOString(),
    };
    retryAt =
      Date.now() + Math.min(15 * 60000, 30000 * 2 ** Math.min(failures++, 5));
    if (!stopping)
      console.log(
        `Connection not ready: ${error.message} Retrying while this terminal stays open.`,
      );
  } finally {
    syncing = false;
    save();
  }
}
const heartbeat = setInterval(() => {
  save();
  void syncConnection().catch(() => {
    state.connection = {
      status: "setup-error",
      message: "Check local service settings.",
    };
    save();
  });
}, 10000);
async function shutdown() {
  if (stopping) return;
  stopping = true;
  state.status = "stopping";
  console.log("Stopping the local tunnel, keeper, and Bee...");
  clearInterval(heartbeat);
  for (const timer of timers) clearTimeout(timer);
  for (const child of children.values()) signalChild(child, "SIGTERM");
  const deadline = Date.now() + 18000;
  while (children.size && Date.now() < deadline)
    await new Promise((r) => setTimeout(r, 200));
  for (const child of children.values()) signalChild(child, "SIGKILL");
  state.status = "stopped";
  state.tunnelUrl = null;
  state.connection = { status: "disconnected" };
  save();
  console.log(
    "Disconnected. Run npm run keeper:start whenever you need it again.",
  );
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("SIGHUP", shutdown);
save();
