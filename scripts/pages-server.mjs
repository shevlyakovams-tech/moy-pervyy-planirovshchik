import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve("docs");
const port = Number(process.env.PORT || 4173);
const types = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".svg":"image/svg+xml" };

http.createServer((request, response) => {
  const urlPath = decodeURIComponent(new URL(request.url, `http://127.0.0.1:${port}`).pathname);
  const relative = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const candidate = path.resolve(root, relative);
  const safePath = candidate.startsWith(root) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()
    ? candidate
    : path.join(root, "404.html");
  response.writeHead(safePath.endsWith("404.html") ? 404 : 200, { "Content-Type": types[path.extname(safePath)] || "application/octet-stream", "Cache-Control":"no-store" });
  fs.createReadStream(safePath).pipe(response);
}).listen(port, "127.0.0.1", () => console.log(`Pages preview: http://127.0.0.1:${port}`));
