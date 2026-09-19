import { build } from "esbuild";
import { cp, mkdir } from "node:fs/promises";
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
  format: "esm",
  outfile: "public/reader/app.js",
  target: ["es2022"],
});
console.log("Independent reader built in public/reader.");
