import http from "node:http";
import fs from "node:fs";
import path from "node:path";

export default async function globalSetup() {
  const root = path.resolve("docs");
  const types: Record<string,string> = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".svg":"image/svg+xml" };
  const server = http.createServer((request, response) => {
    const urlPath = decodeURIComponent(new URL(request.url || "/", "http://127.0.0.1:4173").pathname);
    const relative = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
    const candidate = path.resolve(root, relative);
    const safePath = candidate.startsWith(root) && fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : path.join(root, "404.html");
    response.writeHead(safePath.endsWith("404.html") ? 404 : 200, { "Content-Type": types[path.extname(safePath)] || "application/octet-stream", "Cache-Control":"no-store" });
    fs.createReadStream(safePath).pipe(response);
  });
  await new Promise<void>((resolve, reject) => server.once("error", reject).listen(4173, "127.0.0.1", resolve));
  return async () => await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
