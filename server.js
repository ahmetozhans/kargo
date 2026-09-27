import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from './api/index.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
http.createServer(async (req,res)=>{
  if (req.url.startsWith('/api/')) return handler(req,res);
  const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file = path.join(root,pathname === '/' ? 'index.html' : pathname);
  if (!file.startsWith(root+path.sep)) {res.writeHead(403).end();return;}
  try {const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(data);}
  catch {res.writeHead(404).end('Not found');}
}).listen(process.env.PORT||3000,()=>console.log(`Kargo: http://localhost:${process.env.PORT||3000}`));
