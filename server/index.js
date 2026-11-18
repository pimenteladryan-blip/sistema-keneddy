'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const publicRoot = path.resolve(__dirname, '..', 'public');
const port = Number(process.env.PORT) || 3000;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8'
};

function sendNotFound(res, isApi = false) {
  res.writeHead(404, {
    'Content-Type': isApi ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store'
  });
  res.end(isApi ? JSON.stringify({ error: 'Rota da API não encontrada.' }) : 'Not Found');
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400);
    return res.end('Bad Request');
  }

  // Não transformar chamadas de API inexistentes em respostas HTML.
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    return sendNotFound(res, true);
  }

  const requested = path.resolve(publicRoot, '.' + pathname);
  if (requested !== publicRoot && !requested.startsWith(publicRoot + path.sep)) {
    res.writeHead(403, { 'X-Content-Type-Options': 'nosniff' });
    return res.end('Forbidden');
  }

  let file = requested;
  try {
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      file = path.join(file, 'index.html');
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      file = path.join(publicRoot, 'index.html');
    }
  } catch {
    file = path.join(publicRoot, 'index.html');
  }

  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(500, { 'X-Content-Type-Options': 'nosniff' });
      return res.end('Internal Server Error');
    }

    res.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log('Sistema Kennedy disponível na porta ' + port);
});
