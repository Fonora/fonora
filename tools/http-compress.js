/**
 * Response compression, using Node's own zlib so this costs no dependency.
 *
 * Nothing was compressed before: the bootstrap payload went out as 1.1 MB of JSON
 * that gzips to 119 KB, and every stylesheet and module went out whole. Text
 * compresses four to ten times over here, so this is the cheapest speed available.
 *
 * Very large bodies are sent raw. The vendored speech bundles are tens of megabytes,
 * gzip on that scale costs seconds of CPU per request, and they are served with
 * immutable cache headers instead so a browser asks for them once.
 */
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';

const MIN_BYTES = 1024;
const MAX_BYTES = 64 * 1024 * 1024;

/**
 * Types where compression pays. Images and audio arrive already packed; wasm does
 * not, and the eSpeak binary alone halves from 18 MB to 9 MB.
 */
const COMPRESSIBLE = /^(?:text\/|application\/(?:json|javascript|xml|manifest|wasm)|image\/svg)/i;

/**
 * Compressed bodies for immutable assets, so a multi-megabyte gzip is computed
 * once per process rather than once per visitor. Keyed by content and encoding,
 * and bounded, because these are the assets worth holding and there are few.
 */
const cache = new Map();
const CACHE_MAX_ENTRIES = 12;
const CACHEABLE_FROM = 1024 * 1024;

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {'br'|'gzip'|null}
 */
export function negotiateEncoding(req) {
  const accept = String(req?.headers?.['accept-encoding'] ?? '');
  if (/\bbr\b/i.test(accept)) return 'br';
  if (/\bgzip\b/i.test(accept)) return 'gzip';
  return null;
}

/**
 * Compress when it is worth it, else hand back the original.
 *
 * @param {Buffer|string} body
 * @param {string} contentType
 * @param {'br'|'gzip'|null} encoding
 * @returns {{ body: Buffer, encoding: string|null }}
 */
export function maybeCompress(body, contentType, encoding, cacheKey = null) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  if (!encoding || buf.length < MIN_BYTES || buf.length > MAX_BYTES) {
    return { body: buf, encoding: null };
  }
  if (!COMPRESSIBLE.test(String(contentType ?? ''))) return { body: buf, encoding: null };

  const key = cacheKey && buf.length >= CACHEABLE_FROM ? `${encoding}:${cacheKey}` : null;
  if (key) {
    const hit = cache.get(key);
    if (hit) return { body: hit, encoding };
  }

  try {
    const out = encoding === 'br'
      // Quality 5 is close to gzip's cost and still beats it on ratio.
      ? brotliCompressSync(buf, {
        params: {
          [constants.BROTLI_PARAM_QUALITY]: 5,
          [constants.BROTLI_PARAM_SIZE_HINT]: buf.length,
        },
      })
      : gzipSync(buf, { level: 6 });

    if (key) {
      if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value);
      cache.set(key, out);
    }
    return { body: out, encoding };
  } catch {
    return { body: buf, encoding: null };
  }
}

/**
 * Write a response, compressing the body when the client accepts it.
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {Record<string, string>} headers
 * @param {Buffer|string} body
 * @param {string|null} [cacheKey] Identity of an immutable asset, so a large
 *   compression runs once per process instead of once per request.
 */
export function sendBody(req, res, status, headers, body, cacheKey = null) {
  const contentType = headers['Content-Type'] ?? headers['content-type'] ?? '';
  const { body: out, encoding } = maybeCompress(body, contentType, negotiateEncoding(req), cacheKey);
  const final = { ...headers, 'Content-Length': String(out.length) };
  if (encoding) {
    final['Content-Encoding'] = encoding;
    // Caches must key on the encoding, or a gzip body reaches a client that cannot read it.
    final.Vary = final.Vary ? `${final.Vary}, Accept-Encoding` : 'Accept-Encoding';
  }
  res.writeHead(status, final);
  res.end(out);
}
