// Local preview: serves public/ and runs api/cafe.js the way Vercel would.
// Reads optional settings (HOST_KEY, Redis URL/token) from .env.local.
import { createServer } from "node:http";
import { createReadStream, promises as fs, readFileSync } from "node:fs";
import path from "node:path";

try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
} catch {}

const { default: handler } = await import("../api/cafe.js");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
};
const PORT = Number(process.env.PORT || 3000);
const ROOT = path.resolve("public");

// Safari won't play a video unless the server answers byte-range requests.
async function serveFile(req, res, file) {
  const { size } = await fs.stat(file);
  res.setHeader("Content-Type", TYPES[path.extname(file)] || "application/octet-stream");
  res.setHeader("Accept-Ranges", "bytes");
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : size - Number(range[2]);
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start < 0) {
      res.statusCode = 416;
      res.setHeader("Content-Range", `bytes */${size}`);
      return res.end();
    }
    res.statusCode = 206;
    res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
    res.setHeader("Content-Length", end - start + 1);
    return createReadStream(file, { start, end }).pipe(res);
  }
  res.setHeader("Content-Length", size);
  createReadStream(file).pipe(res);
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname === "/api/cafe") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      try {
        req.body = raw ? JSON.parse(raw) : {};
      } catch {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: "Bad request." }));
      }
      return await handler(req, res);
    }
    const page = url.pathname === "/" ? "index.html" : url.pathname === "/host" ? "host.html" : url.pathname;
    const file = path.join(ROOT, path.normalize(decodeURIComponent(page)));
    if (!file.startsWith(ROOT + path.sep)) throw new Error("outside public/");
    await serveFile(req, res, file);
  } catch {
    if (!res.headersSent) res.statusCode = 404;
    res.end("Not found");
  }
}).listen(PORT, () => {
  console.log(`Guests: http://localhost:${PORT}/`);
  console.log(`Host:   http://localhost:${PORT}/host?key=${process.env.HOST_KEY || "devhost"}`);
});
