import { build } from "esbuild";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
await mkdir("public/reader", { recursive: true });
await Promise.all(
  ["index.html", "style.css"].map((file) =>
    cp(`reader/${file}`, `public/reader/${file}`),
  ),
);
await build({
  entryPoints: ["reader/src.js"],
  bundle: true,
  minify: true,
  format: "iife",
  outfile: "public/reader/app.js",
  target: ["es2022"],
});
const [html, css, script] = await Promise.all([
  readFile("reader/index.html", "utf8"),
  readFile("reader/style.css", "utf8"),
  readFile("public/reader/app.js", "utf8"),
]);
const standalone = html
  .replace(
    '<link rel="stylesheet" href="./style.css" />',
    () => `<style>${css}</style>`,
  )
  .replace(
    '<script type="module" src="./app.js"></script>',
    () => `<script>${script.replace(/<\/script/gi, "<\\/script")}</script>`,
  );
await writeFile("public/reader/standalone.html", standalone);
console.log(
  "Independent reader and single-file recovery card built in public/reader.",
);
