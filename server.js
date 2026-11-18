const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = process.env.PORT || 3000;
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8"
};

http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    res.writeHead(400);
    return res.end("Bad Request");
  }

  const requested = path.resolve(root, "." + pathname);
  if (requested !== root && !requested.startsWith(root + path.sep)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  let file = requested;
  try {
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      file = path.join(file, "index.html");
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      file = path.join(root, "index.html");
    }
  } catch {
    file = path.join(root, "index.html");
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(500);
      return res.end("Internal Server Error");
    }
    res.writeHead(200, {
      "Content-Type": mime[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    res.end(data);
  });
}).listen(port, "0.0.0.0", () => {
  console.log(`Sistema Kennedy disponível na porta ${port}`);
});
