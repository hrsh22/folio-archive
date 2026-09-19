import { zipSync, strToU8 } from "fflate";
import { displayText } from "../src/lib/display-text.ts";
import { referenceFromInput as reference } from "../src/lib/archive-format.ts";
import { resolveArchive } from "../src/lib/network.ts";
import { verifiedBytes } from "../src/lib/browser-recovery.ts";
const $ = (id) => document.getElementById(id);
let opened;
const status = (message, error = false) => {
  $("status").textContent = displayText(message);
  $("status").classList.toggle("error", error);
};
function endpoint(value) {
  const u = new URL(value);
  if (
    !["http:", "https:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    u.search ||
    u.hash
  )
    throw Error("Use an HTTP(S) endpoint without embedded credentials.");
  return u.href.replace(/\/$/, "");
}
const fileUrl = (root, snapshot, path) =>
  `${root}/bzz/${snapshot}/${path.split("/").map(encodeURIComponent).join("/")}`;
function verify(file, context = opened) {
  return verifiedBytes(context.root, context.snapshot, file);
}
function save(bytes, name, type = "application/octet-stream") {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = displayText(name);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
async function openArchive(value) {
  $("open").disabled = true;
  $("archive").hidden = true;
  status("Resolving the archive from Swarm…");
  try {
    const ref = reference(value),
      root = endpoint($("endpoint").value);
    // The same public parser, feed lookup and format validation serve every reader.
    const { descriptor, snapshot, archive, feedIndex } = await resolveArchive(
      ref,
      root,
    );
    opened = { root, snapshot, archive, descriptor, feedIndex };
    $("title").textContent = displayText(archive.title);
    $("description").textContent = displayText(archive.description);
    $("count").textContent =
      `${archive.files.length} FILES · PUBLISHED ${new Date(archive.publishedAt).toLocaleDateString()}`;
    $("storage").textContent =
      `Storage observation: approximately ${(archive.storage.remainingSeconds / 86400).toFixed(1)} days remained when checked on ${new Date(archive.storage.observedAt).toLocaleString()}. This is a historical estimate, not a current guarantee.`;
    $("technical").textContent = JSON.stringify(
      {
        descriptor,
        snapshot,
        publishedAt: archive.publishedAt,
      },
      null,
      2,
    );
    $("files").replaceChildren();
    for (const file of archive.files) {
      const card = document.createElement("article");
      card.className = "file";
      if (/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type)) {
        const img = document.createElement("img");
        img.src = fileUrl(root, snapshot, file.path);
        img.alt = displayText(file.name);
        img.loading = "lazy";
        card.append(img);
      } else {
        const icon = document.createElement("div");
        icon.className = "placeholder";
        icon.textContent = "Aa";
        card.append(icon);
      }
      const info = document.createElement("div");
      info.className = "info";
      const h = document.createElement("h3");
      h.textContent = displayText(file.name);
      const meta = document.createElement("p");
      meta.textContent = `${(file.size / 1024).toFixed(1)} KB · ${file.type}`;
      const button = document.createElement("button");
      button.textContent = "Verify & download ↓";
      button.onclick = async () => {
        button.disabled = true;
        try {
          save(await verify(file), file.name, file.type);
          status(`${file.name}: checksum verified.`);
        } catch (e) {
          status(e.message, true);
        } finally {
          button.disabled = false;
        }
      };
      info.append(h, meta, button);
      card.append(info);
      $("files").append(card);
    }
    $("archive").hidden = false;
    status(
      "Archive retrieved from Swarm. Downloads are verified against the published checksums.",
    );
  } catch (e) {
    opened = undefined;
    status(e.message, true);
  } finally {
    $("open").disabled = false;
  }
}
$("open-form").onsubmit = (e) => {
  e.preventDefault();
  openArchive($("address").value);
};
$("recover").onclick = async () => {
  if (!opened) return;
  $("recover").disabled = true;
  $("open").disabled = true;
  const context = opened;
  try {
    const zip = {},
      results = [];
    for (const [i, file] of context.archive.files.entries()) {
      status(
        `Recovering and verifying ${i + 1} of ${context.archive.files.length}: ${file.name}`,
      );
      zip[file.path] = await verify(file, context);
      results.push({ path: file.path, sha256: file.sha256, verified: true });
    }
    zip["archive.json"] = strToU8(JSON.stringify(context.archive, null, 2));
    zip["bootstrap.json"] = strToU8(
      JSON.stringify(context.descriptor, null, 2),
    );
    zip["recovery-report.json"] = strToU8(
      JSON.stringify(
        {
          observedAt: new Date().toISOString(),
          snapshot: context.snapshot,
          feedIndex: context.feedIndex,
          endpoint: context.root,
          files: results,
          complete: true,
        },
        null,
        2,
      ),
    );
    save(
      zipSync(zip, { level: 0 }),
      "folio-recovered-archive.zip",
      "application/zip",
    );
    status(
      `All ${results.length} files recovered and verified. Your ZIP includes the inventory and verification report.`,
    );
  } catch (e) {
    status(
      `Recovery incomplete: ${e.message} No complete archive was issued.`,
      true,
    );
  } finally {
    $("recover").disabled = false;
    $("open").disabled = false;
  }
};
const params = new URLSearchParams(location.search);
const saved = JSON.parse($("folio-recovery-config")?.textContent || "null");
if (saved) {
  $("endpoint").value = endpoint(saved.endpoint);
  $("recovery-note").hidden = false;
}
if (params.get("endpoint")) $("endpoint").value = params.get("endpoint");
if (params.get("archive")) {
  $("address").value = params.get("archive");
  openArchive(params.get("archive"));
} else if (saved?.descriptor?.manifestReference) {
  $("address").value = reference(saved.descriptor.manifestReference);
  openArchive($("address").value);
} else if (location.pathname.includes("/bzz/")) {
  const match = location.pathname.match(/\/bzz\/([a-f0-9]{64})/i);
  if (match) {
    $("address").value = match[1];
    openArchive(match[1]);
  }
}
