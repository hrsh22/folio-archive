import { mkdir, writeFile } from "node:fs/promises";
await mkdir("public/samples", { recursive: true });
const names = [
  "A study in ochre",
  "The indigo folio",
  "Notes from the valley",
  "A field of small things",
  "Fragments, carefully kept",
  "The keeper’s index",
];
const colours = [
  ["#ead6ad", "#54442e", "#d7ba83"],
  ["#d8dfd4", "#324c56", "#a3b9b2"],
  ["#e0b6a0", "#6f4238", "#c99475"],
  ["#e9dcb8", "#606149", "#c9bf91"],
  ["#c3bba2", "#4a4938", "#a39974"],
  ["#dfcbbc", "#775244", "#c7a78f"],
];
const index = [];
for (let n = 0; n < names.length; n++) {
  const [paper, ink, edge] = colours[n];
  let marks = "";
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 37; col++) {
      const x = 100 + col * 22,
        y = 178 + row * 31;
      const h = 6 + ((row * 13 + col * 7 + n) % 12);
      marks += `<path d="M ${x} ${y} q 5 -${h} 10 -2 q 5 8 8 -3 m -13 6 l 12 -1" fill="none" stroke="${ink}" stroke-width="${1.1 + (col % 3) * 0.3}" opacity="${0.45 + (col % 5) * 0.08}"/>`;
    }
  }
  const motif = `<g transform="translate(550 100)" stroke="${ink}" fill="none" opacity=".65"><circle r="23"/><circle r="17"/>${Array.from({ length: 8 }, (_, i) => `<ellipse rx="8" ry="27" transform="rotate(${i * 45})"/>`).join("")}</g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="720" viewBox="0 0 1100 720"><defs><filter id="paper"><feTurbulence baseFrequency=".65" numOctaves="3" seed="${n + 1}" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".08"/></feComponentTransfer><feBlend in="SourceGraphic" mode="multiply"/></filter></defs><rect width="1100" height="720" fill="${edge}"/><rect x="32" y="30" width="1036" height="660" rx="2" fill="${paper}" filter="url(#paper)"/><rect x="65" y="60" width="970" height="594" fill="none" stroke="${ink}" opacity=".22"/><path d="M72 145H1028M72 563H1028" stroke="${ink}" opacity=".3"/>${motif}${marks}<circle cx="69" cy="354" r="11" fill="${edge}"/><circle cx="1031" cy="354" r="11" fill="${edge}"/><text x="100" y="613" fill="${ink}" font-family="serif" font-size="24">${names[n]}</text><text x="1000" y="614" fill="${ink}" font-family="monospace" font-size="16" text-anchor="end">STUDY ${String(n + 1).padStart(2, "0")} / SYNTHETIC</text></svg>`;
  const file = `folio-${n + 1}.svg`;
  await writeFile(`public/samples/${file}`, svg);
  index.push({
    name: `${String(n + 1).padStart(2, "0")} - ${names[n]}.svg`,
    file,
  });
}
await writeFile("public/samples/index.json", JSON.stringify(index, null, 2));
await writeFile(
  "public/samples/PROVENANCE.md",
  "These six synthetic folio illustrations were created for the Folio demo. They do not reproduce historical manuscripts or meaningful script. Original demo artwork; released under CC0.\n",
);
console.log("Created six labelled synthetic folio studies.");
