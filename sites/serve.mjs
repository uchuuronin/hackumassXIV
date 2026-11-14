// Serves the demo sites. No install needed:  node sites/serve.mjs
//
//   http://localhost:4173/shop/     the demo shop
//   http://localhost:4173/clinic/   the demo clinic
//   http://localhost:4174/          the adverts, on a second address so they are
//                                   "from another website", as real adverts are
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};

function serve(root, port, name) {
  const base = resolve(here, root);
  createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let file = normalize(join(base, path));
      if (file !== base && !file.startsWith(base + sep)) throw new Error('outside');
      if ((await stat(file)).isDirectory()) {
        if (!path.endsWith('/')) {
          res.writeHead(302, { Location: `${path}/` });
          return res.end();
        }
        file = join(file, 'index.html');
      }
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    }
  }).listen(port, () => console.log(`${name}: http://localhost:${port}/`));
}

serve('.', Number(process.env.SITES_PORT ?? 4173), 'Demo sites');
serve('ads', Number(process.env.ADS_PORT ?? 4174), 'Adverts   ');
