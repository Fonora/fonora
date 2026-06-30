/**
 * Fonoran language API: Postgres-backed store with JSON seed/snapshot interchange.
 */

import {
  getLab,
  getHealth,
  loadBucket,
  getLabGraph,
  getLabGraphPreview,
  runDda,
  patchSound,
  assignCompoundMeaning,
  addCompound,
  addSound,
  resetReviewStates,
  setReviewState,
  previewSoundImpact,
  undoLast,
  recomposeCompound,
} from './fonoran-sound-bucket.js';
import { resetProject } from './fonoran-reset.js';
import { loadEnglishLexicon } from './fonoran-english-lexicon.js';
import { translateEnglish } from './fonoran-translator.js';
import { loadTranslationCorpus, runTranslationGapReport, loadLatestGapReport } from './fonoran-translation-gaps.js';
import { loadParticles } from './fonoran-particles.js';
import { buildFonoran } from './fonoran-build.js';
import {
  getRootCandidates,
  getRootCandidate,
  getCanonicalRoots,
  patchRootCandidate,
  regenerateRootCandidate,
  runRootCandidateGeneration,
  reconcileInventoryFromLab,
} from './fonoran-root-store.js';
import { loadConceptInventory, loadRuntimeConceptInventory } from './fonoran-concepts.js';
import {
  createConcept,
  deleteConcept,
  getConceptForEditor,
  listConceptDomains,
  patchConcept,
} from './fonoran-concept-store.js';
import {
  getSessionUser,
  isWriteAuthRequired,
  isAdminUser,
  isSnapshotAdminRequired,
  adminRequiredResponse,
  unauthorizedResponse,
} from './fonoran-auth.js';
import {
  createSnapshotZipStream,
  getSnapshotStatus,
  importSnapshotZip,
  previewSnapshotZip,
} from './fonoran-snapshot.js';

export function jsonResponse(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

export async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  return JSON.parse(raw);
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function snapshotZipFromBody(body, rawBuffer) {
  if (body?.zip_base64) {
    return Buffer.from(body.zip_base64, 'base64');
  }
  if (rawBuffer?.length && !rawBuffer.toString('utf8').trimStart().startsWith('{')) {
    return rawBuffer;
  }
  return null;
}

async function getBootstrap() {
  const bucket = await loadBucket();
  const lab = await getLab(bucket);
  const [health, lexicon] = await Promise.all([
    getHealth(bucket),
    loadEnglishLexicon(lab),
  ]);
  return { lab, health, lexicon };
}

export async function handleFonoranApi(req, res, pathname, method) {
  const done = (status, body) => {
    jsonResponse(res, status, body);
    return true;
  };
  if (isWriteAuthRequired(pathname, method) && !getSessionUser(req)) {
    unauthorizedResponse(res);
    return true;
  }
  if (isSnapshotAdminRequired(pathname, method) && !isAdminUser(req)) {
    adminRequiredResponse(res);
    return true;
  }
  try {
    if (pathname === '/api/fonoran/snapshot/status' && method === 'GET') {
      return done(200, await getSnapshotStatus());
    }
    if (pathname === '/api/fonoran/snapshot/export' && method === 'GET') {
      const stamp = new Date().toISOString().slice(0, 10);
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="fonoran-snapshot-${stamp}.zip"`,
        'Cache-Control': 'no-store',
      });
      const archive = await createSnapshotZipStream();
      archive.on('error', (err) => {
        if (!res.headersSent) {
          jsonResponse(res, 500, { error: err.message ?? 'Export failed' });
        } else {
          res.destroy(err);
        }
      });
      archive.pipe(res);
      return true;
    }
    if (pathname === '/api/fonoran/snapshot/preview' && method === 'POST') {
      const raw = await readRawBody(req);
      let body = {};
      try {
        body = raw.length ? JSON.parse(raw.toString('utf8')) : {};
      } catch {
        body = {};
      }
      const zip = snapshotZipFromBody(body, raw);
      if (!zip?.length) return done(400, { error: 'Provide zip_base64 or raw zip body' });
      return done(200, previewSnapshotZip(zip));
    }
    if (pathname === '/api/fonoran/snapshot/import' && method === 'POST') {
      const raw = await readRawBody(req);
      let body = {};
      try {
        body = raw.length ? JSON.parse(raw.toString('utf8')) : {};
      } catch {
        body = {};
      }
      if (body.confirm !== 'RESTORE') {
        return done(400, { error: 'Type RESTORE in confirm field to replace all Fonoran state' });
      }
      const zip = snapshotZipFromBody(body, raw);
      if (!zip?.length) return done(400, { error: 'Provide zip_base64 or raw zip body' });
      const preview = previewSnapshotZip(zip);
      const result = await importSnapshotZip(zip);
      return done(200, { imported: true, preview: preview.summary, ...result });
    }
    if (pathname === '/api/fonoran/bootstrap' && method === 'GET') {
      return done(200, await getBootstrap());
    }
    if (pathname === '/api/fonoran/lab' && method === 'GET') {
      return done(200, await getLab());
    }
    if (pathname === '/api/fonoran/lexicon' && method === 'GET') {
      const lab = await getLab();
      return done(200, await loadEnglishLexicon(lab));
    }
    if (pathname === '/api/fonoran/concepts' && method === 'GET') {
      const lab = await getLab();
      return done(200, await loadRuntimeConceptInventory({ lab }));
    }
    if (pathname === '/api/fonoran/concepts/domains' && method === 'GET') {
      return done(200, { domains: await listConceptDomains() });
    }
    if (pathname === '/api/fonoran/concepts' && method === 'POST') {
      const body = await readJsonBody(req);
      return done(201, await createConcept(body));
    }
    const conceptMatch = pathname.match(/^\/api\/fonoran\/concepts\/([^/]+)$/);
    if (conceptMatch && method === 'GET') {
      return done(200, await getConceptForEditor(decodeURIComponent(conceptMatch[1])));
    }
    if (conceptMatch && method === 'PATCH') {
      const body = await readJsonBody(req);
      return done(200, await patchConcept(decodeURIComponent(conceptMatch[1]), body));
    }
    if (conceptMatch && method === 'DELETE') {
      return done(200, await deleteConcept(decodeURIComponent(conceptMatch[1])));
    }
    if (pathname === '/api/fonoran/translate' && method === 'POST') {
      const body = await readJsonBody(req);
      const lab = await getLab();
      return done(200, await translateEnglish(body.text ?? '', { lab }));
    }
    if (pathname === '/api/fonoran/grammar-particles' && method === 'GET') {
      return done(200, await loadParticles());
    }
    if (pathname === '/api/fonoran/translation-tests' && method === 'GET') {
      return done(200, await loadTranslationCorpus());
    }
    if (pathname === '/api/fonoran/translation-tests/latest' && method === 'GET') {
      return done(200, await loadLatestGapReport());
    }
    if (pathname === '/api/fonoran/translation-tests/run' && method === 'POST') {
      const body = await readJsonBody(req);
      const lab = await getLab();
      const level = body.level != null ? Number(body.level) : null;
      return done(200, await runTranslationGapReport({ level, lab }));
    }
    if (pathname === '/api/fonoran/lab/health' && method === 'GET') {
      return done(200, await getHealth());
    }
    if (pathname === '/api/fonoran/lab/run-dda' && method === 'POST') {
      const body = await readJsonBody(req);
      return done(200, await runDda(body.scope ?? 'pending'));
    }
    if (pathname === '/api/fonoran/lab/graph/preview' && method === 'POST') {
      const body = await readJsonBody(req);
      return done(200, await getLabGraphPreview(body));
    }
    const graphMatch = pathname.match(/^\/api\/fonoran\/lab\/graph\/(root|word)\/([^/]+)$/);
    if (graphMatch && method === 'GET') {
      const kind = graphMatch[1];
      const ref = decodeURIComponent(graphMatch[2]);
      return done(200, await getLabGraph(kind, ref));
    }
    if (pathname === '/api/fonoran/lab/undo' && method === 'POST') {
      return done(200, await undoLast());
    }
    if (pathname === '/api/fonoran/lab/seed' && method === 'POST') {
      return done(200, await resetProject());
    }
    if ((pathname === '/api/fonoran/lab/build' || pathname === '/api/fonoran/lab/import-vocabulary') && method === 'POST') {
      const body = await readJsonBody(req);
      return done(200, await buildFonoran({ approveAll: Boolean(body.approve_all) }));
    }
    if (pathname === '/api/fonoran/lab/reset-review' && method === 'POST') {
      return done(200, await resetReviewStates());
    }
    if (pathname === '/api/fonoran/lab/reconcile-inventory' && method === 'POST') {
      return done(200, await reconcileInventoryFromLab());
    }
    const impactMatch = pathname.match(/^\/api\/fonoran\/lab\/impact\/sounds\/([^/]+)$/);
    if (impactMatch && method === 'GET') {
      return done(200, await previewSoundImpact(decodeURIComponent(impactMatch[1])));
    }
    const stateMatch = pathname.match(/^\/api\/fonoran\/lab\/state\/(sound|compound)\/([^/]+)$/);
    if (stateMatch && method === 'PATCH') {
      const kind = stateMatch[1];
      const id = decodeURIComponent(stateMatch[2]);
      const body = await readJsonBody(req);
      return done(200, await setReviewState(kind, id, body.state));
    }
    if (pathname === '/api/fonoran/lab/sounds' && method === 'POST') {
      const body = await readJsonBody(req);
      return done(201, await addSound(body));
    }
    const labSoundMatch = pathname.match(/^\/api\/fonoran\/lab\/sounds\/([^/]+)$/);
    if (labSoundMatch && method === 'PATCH') {
      const spelling = decodeURIComponent(labSoundMatch[1]);
      const body = await readJsonBody(req);
      const newSp = body.spelling?.trim().toLowerCase();
      return done(200, await patchSound(spelling, {
        new_spelling: newSp && newSp !== spelling.trim().toLowerCase() ? newSp : undefined,
        meaning: body.meaning,
        state: body.state,
        concept_id: body.concept_id,
        clear_affected_compounds: Boolean(body.clear_affected_compounds),
      }));
    }
    const labCompoundMatch = pathname.match(/^\/api\/fonoran\/lab\/compounds\/([^/]+)$/);
    if (labCompoundMatch && method === 'PATCH') {
      const id = decodeURIComponent(labCompoundMatch[1]);
      const body = await readJsonBody(req);
      if (Array.isArray(body.components) || Array.isArray(body.parts)) {
        return done(200, await recomposeCompound(id, body));
      }
      return done(200, await assignCompoundMeaning(id, body.meaning, { state: body.state, aliases: body.aliases }));
    }
    if (pathname === '/api/fonoran/lab/compounds' && method === 'POST') {
      const body = await readJsonBody(req);
      return done(201, await addCompound(body));
    }
    if (pathname === '/api/fonoran/roots/candidates' && method === 'GET') {
      const url = new URL(req.url ?? '', 'http://localhost');
      const status = url.searchParams.get('status');
      return done(200, await getRootCandidates({ status: status || null }));
    }
    if (pathname === '/api/fonoran/roots/canonical' && method === 'GET') {
      return done(200, await getCanonicalRoots());
    }
    if (pathname === '/api/fonoran/roots/generate' && method === 'POST') {
      return done(200, await runRootCandidateGeneration());
    }
    const rootCandidateMatch = pathname.match(/^\/api\/fonoran\/roots\/candidates\/([^/]+)$/);
    if (rootCandidateMatch && method === 'GET') {
      return done(200, await getRootCandidate(decodeURIComponent(rootCandidateMatch[1])));
    }
    if (rootCandidateMatch && method === 'PATCH') {
      const id = decodeURIComponent(rootCandidateMatch[1]);
      const body = await readJsonBody(req);
      return done(200, await patchRootCandidate(id, body));
    }
    const rootRegenMatch = pathname.match(/^\/api\/fonoran\/roots\/candidates\/([^/]+)\/regenerate$/);
    if (rootRegenMatch && method === 'POST') {
      const id = decodeURIComponent(rootRegenMatch[1]);
      return done(200, await regenerateRootCandidate(id));
    }
    return false;
  } catch (err) {
    return done(400, { error: err.message ?? 'Request failed' });
  }
}
