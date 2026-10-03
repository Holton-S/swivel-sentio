// Isolated preview: serves the delivered files and forwards API calls to the existing backend.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('./', import.meta.url);
http.createServer(async (req, res) => {
  if (req.url.startsWith('/api/')) {
    const upstream = http.request({hostname:'127.0.0.1', port:3000, path:req.url, method:req.method, headers:req.headers}, incoming => { res.writeHead(incoming.statusCode, incoming.headers); incoming.pipe(res); });
    upstream.on('error', () => { res.writeHead(502, {'Content-Type':'application/json'}); res.end('{"success":false,"error":"Backend unavailable"}'); });
    req.pipe(upstream); return;
  }
  const name = req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0].slice(1);
  if (!['index.html','index.css','app.js'].includes(name)) { res.writeHead(404); res.end(); return; }
  try { const contents = await readFile(fileURLToPath(new URL(name, root))); res.writeHead(200, {'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8','Cache-Control':'no-store'}); res.end(contents); }
  catch { res.writeHead(500); res.end('Preview unavailable'); }
}).listen(3100, '127.0.0.1', () => console.log('Redesign preview: http://127.0.0.1:3100'));
