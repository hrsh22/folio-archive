import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
const root = path.resolve("public/reader");
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    if (!["index.html", "app.js", "style.css"].includes(file)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": file.endsWith(".js")
        ? "text/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : "text/html",
      "Cache-Control": "no-store",
    });
    res.end(await readFile(path.join(root, file)));
  } catch {
    res.writeHead(500);
    res.end("Build the reader with npm run build:reader first.");
  }
}).listen(3001, "127.0.0.1", () =>
  console.log("Independent reader: http://127.0.0.1:3001"),
);
