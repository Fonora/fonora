import './load-env.js';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleAuthRoutes, logAuthStatus } from './tools/fonoran-auth.js';
import { handleFonoranApi } from './tools/fonoran-api.js';
import { handleResearchApi } from './tools/research-notes-api.js';
import { maybeAutoSeedOnStartup, initStore } from './tools/fonoran-store.js';
import {
  getResearchBootstrapData,
  initResearchNotesStore,
  warmPublishedCache,
} from './tools/research-notes-store.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT) || 8000;

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
};

/** Map browser URL prefixes to on-disk paths (keeps large npm bundles out of git). */
const URL_ALIASES = [
  {
    prefix: '/vendor/onnx/',
    bases: [
      join(root, 'vendor', 'onnx'),
      join(root, 'node_modules', 'onnxruntime-web', 'dist'),
      join(root, 'node_modules', 'piper-tts-web', 'node_modules', 'onnxruntime-web', 'dist'),
    ],
  },
  {
    prefix: '/vendor/piper-tts-web/',
    bases: [
      join(root, 'vendor', 'piper-tts-web'),
      join(root, 'node_modules', 'piper-tts-web', 'dist'),
    ],
  },
  {
    prefix: '/vendor/espeak-ng/',
    bases: [
      join(root, 'vendor', 'espeak-ng'),
      join(root, 'node_modules', 'espeak-ng', 'dist'),
    ],
  },
  {
    prefix: '/vendor/espeak-audio/',
    bases: [
      join(root, 'vendor', 'espeak-audio'),
      join(root, 'node_modules', '@echogarden', 'espeak-ng-emscripten'),
    ],
  },
];

const ONNX_WASM_CANDIDATES = [
  join(root, 'vendor', 'onnx', 'ort-wasm-simd-threaded.wasm'),
  join(root, 'node_modules', 'onnxruntime-web', 'dist', 'ort-wasm-simd-threaded.wasm'),
  join(
    root,
    'node_modules',
    'piper-tts-web',
    'node_modules',
    'onnxruntime-web',
    'dist',
    'ort-wasm-simd-threaded.wasm',
  ),
];

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

function isDocsViewerRoute(pathname) {
  const path = pathname.replace(/\/$/, '') || '/';
  return path === '/docs' || path.startsWith('/docs/');
}

function isScriptAppRoute(pathname) {
  const path = pathname.replace(/\/$/, '') || '/';
  return path === '/script' || path === '/tools' || path === '/learn';
}

/** /research, /research/timeline, /research/notes/* all render the research notebook shell. */
function isResearchAppRoute(pathname) {
  const path = pathname.replace(/\/$/, '') || '/';
  return path === '/research' || path.startsWith('/research/');
}

/** /fonoran is a legacy alias for the Language tab (Fonoran the language). */
function legacyFonoranRedirect(pathname, search, hash) {
  if (pathname === '/fonoran' || pathname.startsWith('/fonoran/')) {
    let rest = pathname.slice('/fonoran'.length);
    if (!rest || rest === '/') rest = '';
    return `/language${rest}${search}${hash}`;
  }
  return null;
}

/** Canonical section URLs omit trailing slashes (/script, /tools, /language). */
function sectionCanonicalRedirect(pathname, search, hash) {
  if (
    pathname === '/script/' ||
    pathname === '/tools/' ||
    pathname === '/learn/' ||
    pathname === '/language/' ||
    pathname === '/research/'
  ) {
    return `${pathname.slice(0, -1)}${search}${hash}`;
  }
  return null;
}

function normalizePathname(pathname) {
  let path = decodeURIComponent(pathname);
  if (path === '/script' || path === '/script/') path = '/index.html';
  if (path === '/learn' || path === '/learn/') path = '/index.html';
  if (path === '/tools' || path === '/tools/') path = '/index.html';
  if (path === '/language' || path === '/language/') path = '/language/index.html';
  if (path.endsWith('/')) path += 'index.html';
  if (path === '/') path = '/index.html';
  return path;
}

function resolveFilePath(pathname) {
  for (const { prefix, bases } of URL_ALIASES) {
    if (!pathname.startsWith(prefix)) continue;
    const rel = pathname.slice(prefix.length);
    for (const base of bases) {
      const candidate = join(base, rel);
      if (!candidate.startsWith(root) || candidate.includes('..')) continue;
      if (existsSync(candidate)) return candidate;
    }
    return null;
  }

  const filePath = join(root, pathname.replace(/^\//, ''));
  if (!filePath.startsWith(root) || filePath.includes('..')) return null;
  return filePath;
}

function findOnnxWasmPath() {
  return ONNX_WASM_CANDIDATES.find((path) => existsSync(path)) ?? null;
}

function cacheControl(pathname) {
  if (
    pathname === '/index.html' ||
    pathname === '/' ||
    pathname === '/script' ||
    pathname === '/learn' ||
    pathname === '/tools' ||
    pathname === '/language' ||
    pathname === '/research'
  ) {
    return 'no-cache';
  }
  if (/\.(wasm|data|js|mjs|css)$/.test(pathname)) return 'public, max-age=31536000, immutable';
  return 'public, max-age=3600';
}

function researchNoteSlugFromPath(pathname) {
  const match = pathname.match(/^\/research\/notes\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function injectResearchBootstrap(html, bootstrap) {
  const json = JSON.stringify(bootstrap).replace(/</g, '\\u003c');
  const script = `<script type="application/json" id="research-notes-bootstrap">${json}</script>`;
  return html.replace('</head>', `${script}\n</head>`);
}

async function serveResearchApp(res, pathname) {
  const indexPath = join(root, 'research', 'index.html');
  let body = await readFile(indexPath, 'utf8');
  try {
    const slug = researchNoteSlugFromPath(pathname);
    const bootstrap = await getResearchBootstrapData(slug);
    body = injectResearchBootstrap(body, bootstrap);
  } catch (err) {
    console.warn('Research bootstrap skipped:', err instanceof Error ? err.message : err);
  }
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache',
    ...SECURITY_HEADERS,
  });
  res.end(body);
}

async function bootstrapServerData() {
  try {
    await initStore();
    await initResearchNotesStore();
    await warmPublishedCache();
    await maybeAutoSeedOnStartup();
  } catch (err) {
    console.warn('Fonoran startup init skipped:', err instanceof Error ? err.message : err);
  }
}

await bootstrapServerData();

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const method = req.method ?? 'GET';

    if (url.pathname === '/health') {
      const onnxWasm = findOnnxWasmPath();
      if (!onnxWasm) {
        res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS });
        res.end('onnx wasm missing: run npm install');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS });
      res.end('ok');
      return;
    }

    if (url.pathname.startsWith('/auth/')) {
      const handled = await handleAuthRoutes(req, res, url, method);
      if (handled) return;
      res.writeHead(404, { 'Content-Type': 'application/json', ...SECURITY_HEADERS });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    if (url.pathname.startsWith('/api/fonoran/')) {
      const handled = await handleFonoranApi(req, res, url.pathname, method);
      if (handled) return;
      res.writeHead(404, { 'Content-Type': 'application/json', ...SECURITY_HEADERS });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    if (url.pathname.startsWith('/api/research/')) {
      const handled = await handleResearchApi(req, res, url.pathname, method);
      if (handled) return;
      res.writeHead(404, { 'Content-Type': 'application/json', ...SECURITY_HEADERS });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    const legacyRedirect = legacyFonoranRedirect(url.pathname, url.search, url.hash);
    if (legacyRedirect) {
      res.writeHead(301, { Location: legacyRedirect, ...SECURITY_HEADERS });
      res.end();
      return;
    }

    const canonicalRedirect = sectionCanonicalRedirect(url.pathname, url.search, url.hash);
    if (canonicalRedirect) {
      res.writeHead(301, { Location: canonicalRedirect, ...SECURITY_HEADERS });
      res.end();
      return;
    }

    if (isScriptAppRoute(url.pathname)) {
      const indexPath = join(root, 'index.html');
      const body = await readFile(indexPath);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
        ...SECURITY_HEADERS,
      });
      res.end(body);
      return;
    }

    if (isResearchAppRoute(url.pathname)) {
      await serveResearchApp(res, url.pathname);
      return;
    }

    if (isDocsViewerRoute(url.pathname)) {
      const bare = url.pathname.replace(/\/$/, '') || '/';
      // /docs is the in-app viewer shell; the repo also has a docs/ directory on disk.
      if (bare === '/docs') {
        const indexPath = join(root, 'index.html');
        const body = await readFile(indexPath);
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
          ...SECURITY_HEADERS,
        });
        res.end(body);
        return;
      }
      const staticPath = resolveFilePath(normalizePathname(url.pathname));
      if (!staticPath || !existsSync(staticPath)) {
        const indexPath = join(root, 'index.html');
        const body = await readFile(indexPath);
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
          ...SECURITY_HEADERS,
        });
        res.end(body);
        return;
      }
    }

    const pathname = normalizePathname(url.pathname);
    const filePath = resolveFilePath(pathname);
    if (!filePath) {
      res.writeHead(403, SECURITY_HEADERS);
      res.end('Forbidden');
      return;
    }

    const info = await stat(filePath);
    if (!info.isFile()) {
      res.writeHead(404, SECURITY_HEADERS);
      res.end('Not found');
      return;
    }

    const body = await readFile(filePath);
    const type = MIME[extname(filePath)] ?? 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': cacheControl(pathname),
      ...SECURITY_HEADERS,
    });
    res.end(body);
  } catch {
    res.writeHead(404, SECURITY_HEADERS);
    res.end('Not found');
  }
}).listen(port, host, () => {
  console.log(`Fonora listening on http://${host}:${port}`);
  logAuthStatus();
});
