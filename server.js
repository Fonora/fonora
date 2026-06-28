import './load-env.js';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleAuthRoutes, logAuthStatus } from './tools/fonoran-auth.js';
import { handleFonoranApi } from './tools/fonoran-api.js';
import { maybeAutoSeedOnStartup } from './tools/fonoran-store.js';

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
  return path === '/script';
}

function legacyLanguageRedirect(pathname, search, hash) {
  if (pathname === '/fonoran' || pathname.startsWith('/fonoran/')) {
    let rest = pathname.slice('/fonoran'.length);
    if (!rest || rest === '/') rest = '';
    return `/language${rest}${search}${hash}`;
  }
  return null;
}

/** Canonical section URLs omit trailing slashes (/script, /language). */
function sectionCanonicalRedirect(pathname, search, hash) {
  if (pathname === '/script/' || pathname === '/language/') {
    return `${pathname.slice(0, -1)}${search}${hash}`;
  }
  return null;
}

function normalizePathname(pathname) {
  let path = decodeURIComponent(pathname);
  if (path === '/script' || path === '/script/') path = '/index.html';
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
  if (pathname === '/index.html' || pathname === '/' || pathname === '/script' || pathname === '/language') {
    return 'no-cache';
  }
  if (/\.(wasm|data|js|mjs|css)$/.test(pathname)) return 'public, max-age=31536000, immutable';
  return 'public, max-age=3600';
}

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

    const legacyRedirect = legacyLanguageRedirect(url.pathname, url.search, url.hash);
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

    if (isDocsViewerRoute(url.pathname)) {
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
}).listen(port, host, async () => {
  console.log(`Fonora listening on http://${host}:${port}`);
  logAuthStatus();
  try {
    await maybeAutoSeedOnStartup();
  } catch (err) {
    console.warn('Fonoran auto-import skipped:', err instanceof Error ? err.message : err);
  }
});
