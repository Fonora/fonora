/**
 * Server-side Learn course-phrases: runtime compile + lab_rev cache.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadBucket } from './fonoran-sound-bucket.js';
import { compileCoursePhrasesDocument } from './fonoran-course-phrases-compile.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BAKED_PATH = join(ROOT, 'data/fonoran-course-phrases.json');

/** @type {{ labRev: string, etag: string, payload: object } | null} */
let coursePhrasesCache = null;

/** @returns {Promise<object>} */
async function loadBakedCoursePhrases() {
  const raw = await readFile(BAKED_PATH, 'utf8');
  return JSON.parse(raw);
}

/**
 * @param {object} payload
 * @returns {string}
 */
function etagForPayload(payload) {
  const hash = createHash('sha1')
    .update(JSON.stringify({
      lab_rev: payload.lab_rev,
      translated: payload.translated,
      gap: payload.gap,
      pending: payload.pending,
      total_phrases: payload.total_phrases,
    }))
    .digest('hex')
    .slice(0, 16);
  return `"learn-phrases-${hash}"`;
}

/**
 * Compile (or return cached) Learn course phrases for the current lab revision.
 * @returns {Promise<{ payload: object, etag: string, labRev: string }>}
 */
export async function getLearnCoursePhrases() {
  const bucket = await loadBucket();
  const labRev = bucket.updated_at ?? '';

  if (coursePhrasesCache?.labRev === labRev) {
    return {
      payload: coursePhrasesCache.payload,
      etag: coursePhrasesCache.etag,
      labRev,
    };
  }

  const baked = await loadBakedCoursePhrases();
  const payload = await compileCoursePhrasesDocument(baked, {
    cacheOnly: true,
    labRev: labRev || null,
  });
  const etag = etagForPayload(payload);
  coursePhrasesCache = { labRev, etag, payload };
  return { payload, etag, labRev };
}

/** Clear in-memory cache (tests / after lab writes if needed). */
export function clearLearnCoursePhrasesCache() {
  coursePhrasesCache = null;
}
