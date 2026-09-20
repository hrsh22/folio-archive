import {
  formatBytes,
  safePath,
  type Archive,
  type Descriptor,
} from "./archive-format";
import { displayText } from "./display-text";

const readable = (value: string) =>
  displayText(value).replace(
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,
    "",
  );
const htmlEntities: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const escapeHtml = (value: string) =>
  readable(value).replace(/[&<>"']/g, (character) => htmlEntities[character]!);
function originalFileLink(path: string) {
  safePath(path);
  if (!path.startsWith("files/"))
    throw new Error("Recovery files must stay inside files/.");
  // Encode each segment, including literal % signs, so a name cannot become a
  // URL scheme, fragment, query or parent traversal. Keep the exact ZIP path.
  return `./${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** Pure presentation of a completed recovery. No network, clock or DOM access. */
export function recoveryCatalogue({
  archive,
  descriptor,
  recoveredAt,
  snapshot,
}: {
  archive: Archive;
  descriptor: Descriptor;
  recoveredAt: string;
  snapshot: string;
}): Record<string, string> {
  const h = escapeHtml;
  const total = archive.files.reduce((sum, file) => sum + file.size, 0);
  const storage = `Approximately ${(archive.storage.remainingSeconds / 86400).toFixed(1)} days of network storage remained when checked on ${archive.storage.observedAt}. This dated observation is not a current balance or a promise of permanence. Renewal and network pricing can change it. The files in this recovered copy are already saved alongside this catalogue.`;
  const handover =
    "Give the next custodian this entire extracted folder, including files/, and ask them to open this catalogue and several original files before access to your old institution ends. Keep another verified copy in a separate place. Agree who monitors network storage and pays for renewal. This public copy contains no signing keys and does not transfer publishing rights; arrange any private credential handover separately.";
  const cards = archive.files
    .map(
      (file, index) => `
    <li class="item">
      <span class="number" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
      <div class="item-body">
        <p class="file-kind">${h(file.type)} <span>/</span> ${h(formatBytes(file.size))}</p>
        <h2><a href="${h(originalFileLink(file.path))}">${h(file.name)}</a></h2>
        <p class="description">${h(file.caption || "No item description was supplied.")}</p>
        <dl><dt>Source and credit</dt><dd>${h(file.source || "Not supplied")}</dd></dl>
        <a class="open-file" href="${h(originalFileLink(file.path))}">Open original file <span aria-hidden="true">&#8599;</span></a>
        <details><summary>File location and checksum</summary><p><code>${h(file.path)}</code></p><p>SHA-256 <code>${h(file.sha256)}</code></p></details>
      </div>
    </li>`,
    )
    .join("");
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; base-uri 'none'; form-action 'none'">
<title>${h(archive.title)} - Folio recovered archive</title>
<style>
:root{color-scheme:light;--paper:#f8f6f0;--ink:#252e2a;--muted:#647065;--green:#355b46;--line:#d8dcd0}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.65 "Trebuchet MS",sans-serif}a{color:var(--green);text-underline-offset:4px}a:focus-visible,summary:focus-visible{outline:3px solid var(--green);outline-offset:5px}header,main,footer{max-width:1080px;margin:auto;padding:0 36px}header{padding-top:28px;padding-bottom:24px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:20px;align-items:baseline}.wordmark{font:36px Georgia,serif}.eyebrow,.file-kind,dt,.number{font-size:11px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted)}.intro{padding:68px 0 38px;max-width:800px}h1{font:normal clamp(40px,7vw,76px)/1.08 Georgia,serif;letter-spacing:-2px;margin:16px 0 24px;overflow-wrap:anywhere}.lede{font-size:19px;color:var(--muted);white-space:pre-wrap}.facts{font-size:12px;color:var(--muted);margin:24px 0 0}.note{border-left:3px solid #9caf91;background:#eef0e6;padding:18px 22px;margin:0 0 36px}.note p{margin:4px 0}.items{list-style:none;padding:0;margin:0}.item{display:grid;grid-template-columns:54px minmax(0,1fr);gap:22px;padding:32px 0;border-top:1px solid var(--line)}.number{padding-top:6px}h2{font:normal 30px/1.25 Georgia,serif;margin:7px 0 14px;overflow-wrap:anywhere}h2 a{text-decoration:none}h2 a:hover{text-decoration:underline}.file-kind{margin:0;overflow-wrap:anywhere}.file-kind span{padding:0 8px;color:#a5ad9c}.description,dd{white-space:pre-wrap;overflow-wrap:anywhere}.description{max-width:760px;margin:0 0 18px}dl{margin:0 0 18px}dt{margin-bottom:4px}dd{margin:0;color:var(--muted);font-size:14px}.open-file{font-size:13px;font-weight:bold}details{font-size:12px;color:var(--muted);margin-top:18px}summary{cursor:pointer}code{font-family:monospace;overflow-wrap:anywhere}details p{margin:10px 0}.afterword{display:grid;grid-template-columns:1fr 1fr;gap:36px;border-top:1px solid var(--line);margin-top:28px;padding-top:30px}.afterword h2{font-size:26px}.afterword p{font-size:14px;color:var(--muted)}footer{margin-top:44px;padding-top:24px;padding-bottom:40px;border-top:1px solid var(--line);font-size:12px;color:var(--muted)}@media(max-width:600px){header,main,footer{padding-left:20px;padding-right:20px}header{align-items:center}.intro{padding-top:38px}.item{grid-template-columns:26px minmax(0,1fr);gap:12px}.afterword{grid-template-columns:1fr;gap:10px}h1{letter-spacing:-1px}.eyebrow{font-size:9px}}@media print{body{background:white;font-size:11pt}header,main,footer{max-width:none;padding-left:0;padding-right:0}.intro{padding-top:24px}h1{font-size:34pt}.item{break-inside:avoid}.note{background:none}.open-file{display:none}}
</style>
</head>
<body>
<header><span class="wordmark">Folio</span><span class="eyebrow">A recovered collection</span></header>
<main>
<section class="intro"><p class="eyebrow">A way back to the story</p><h1>${h(archive.title)}</h1><p class="lede">${h(archive.description || "No collection description was supplied.")}</p><p class="facts">${archive.files.length} items / ${h(formatBytes(total))}<br>Edition published ${h(archive.publishedAt)}<br>Recovered and verified ${h(recoveredAt)}</p></section>
<aside class="note"><strong>Your copy, ready to read.</strong><p>This catalogue opens without an internet connection. Select an item to open its original file. Keep this page and the files folder together after extracting the whole archive.</p><p>Every file passed its published size and SHA-256 checks before this complete archive was created. The catalogue displays the keeper's names, descriptions and credits; it does not authenticate their historical claims.</p></aside>
<ol class="items">${cards}</ol>
<section class="afterword"><div><h2>Pass on the context.</h2><p>${h(handover)}</p></div><div><h2>A dated storage observation.</h2><p>${h(storage)}</p><details><summary>The public address and edition</summary><p>Stable archive address<br><code>${h(descriptor.manifestReference)}</code></p><p>This recovered snapshot<br><code>${h(snapshot)}</code></p><p>Feed owner<br><code>${h(descriptor.owner)}</code></p><p>Feed topic<br><code>${h(descriptor.topic)}</code></p></details></div></section>
</main>
<footer>Original files and storage paths are unchanged. Repeated public names remain separate items. <a href="./READ-ME.txt">Read the handover guide</a> / <a href="./archive.json">Published inventory</a> / <a href="./recovery-report.json">Verification report</a></footer>
</body>
</html>
`;
  const guide = `FOLIO - YOUR VERIFIED ARCHIVE

${readable(archive.title)}

1. Extract the entire archive, if it is a ZIP.
2. Double-click Open archive.html. It needs no internet connection.
3. Select an item by its reviewed name to open the original file. Your computer uses the appropriate application for its type.

Keep Open archive.html, READ-ME.txt and the files folder together. Descriptions and source credits are displayed in the catalogue. The original file paths remain unchanged, so items with the same public name cannot replace one another. If you send this archive onward, send the entire folder.

Recovered and verified: ${readable(recoveredAt)}
Edition published: ${readable(archive.publishedAt)}
Items: ${archive.files.length}
Total original bytes: ${total}

ABOUT THIS COPY

Every original file was retrieved from one immutable Swarm snapshot and passed its published byte count and SHA-256 checksum before this complete archive was created. The keeper supplied the names, descriptions and sources; checksum verification does not authenticate historical claims. The HTML catalogue has no scripts, external fonts or remote resources. Original files keep their original formats and embedded metadata.

MOVING INSTITUTIONS OR CHANGING CUSTODIANS

${handover}

NETWORK STORAGE

${storage}

PUBLIC RECOVERY DETAILS

Stable archive address: ${readable(descriptor.manifestReference)}
Recovered snapshot: ${readable(snapshot)}
Feed owner: ${readable(descriptor.owner)}
Feed topic: ${readable(descriptor.topic)}

archive.json preserves the published inventory and exact storage paths. bootstrap.json holds the public feed address for future editions. recovery-report.json records this retrieval and each verified file. Keep a Folio recovery card as well if you want its independent reader to check for later editions on Swarm. This folder is a complete saved copy of the edition above, not a live connection.
`;
  return { "Open archive.html": html, "READ-ME.txt": guide };
}
