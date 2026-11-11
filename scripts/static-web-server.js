#!/usr/bin/env node
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const root = process.env.STATIC_DIRECTORY ? path.resolve(process.env.STATIC_DIRECTORY) : path.resolve(__dirname, '../release/web');
const previewHost = process.env.STATIC_HOST || '127.0.0.1';
const previewPort = Number(process.env.PORT) || 4173;
const types = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css',
  '.png': 'image/png', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav' };
http.createServer((request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(root + path.sep) || !fs.statSync(file).isFile()) throw new Error('not found');
    let body = fs.readFileSync(file);
    const ext = path.extname(file);
    response.setHeader('Content-Type', types[ext] || 'application/octet-stream');
    response.setHeader('Cache-Control', pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
    if (/\bbr\b/.test(request.headers['accept-encoding'] || '') && ['.html', '.js', '.json', '.css'].includes(ext)) {
      body = zlib.brotliCompressSync(body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } });
      response.setHeader('Content-Encoding', 'br'); response.setHeader('Vary', 'Accept-Encoding');
    }
    response.setHeader('Content-Length', body.length); response.end(body);
  } catch { response.writeHead(404, { 'Content-Type': 'text/plain' }); response.end('Not found'); }
}).listen(previewPort, previewHost, () => console.log(`Static preview: http://${previewHost}:${previewPort}`));
