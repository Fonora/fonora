/**
 * Fonoran language API: file-backed lab store.
 */

import {
  getLab,
  getHealth,
  getLabGraph,
  getLabGraphPreview,
  parseCompoundLive,
  runDda,
  patchSound,
  assignCompoundMeaning,
  addCompound,
  addSound,
  resetReviewStates,
  seedBucket,
  setReviewState,
  previewSoundImpact,
  undoLast,
  recomposeCompound,
} from './fonoran-sound-bucket.js';
import { loadEnglishLexicon } from './fonoran-english-lexicon.js';
import { translateEnglish } from './fonoran-translator.js';
import { buildFonoran } from './fonoran-build.js';
import { generateWords } from './fonoran-word-generator.js';
import {
  getRootCandidates,
  getRootCandidate,
  getCanonicalRoots,
  patchRootCandidate,
  regenerateRootCandidate,
  runRootCandidateGeneration,
} from './fonoran-root-store.js';
import { loadConceptInventory } from './fonoran-concepts.js';
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
  unauthorizedResponse,
} from './fonoran-auth.js';

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

export async function handleFonoranApi(req, res, pathname, method) {
  const done = (status, body) => {
    jsonResponse(res, status, body);
    return true;
  };
  if (isWriteAuthRequired(pathname, method) && !getSessionUser(req)) {
    unauthorizedResponse(res);
    return true;
  }
  try {
    if (pathname === '/api/fonoran/lab' && method === 'GET') {
      return done(200, await getLab());
    }
    if (pathname === '/api/fonoran/lexicon' && method === 'GET') {
      return done(200, await loadEnglishLexicon());
    }
    if (pathname === '/api/fonoran/concepts' && method === 'GET') {
      return done(200, await loadConceptInventory());
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
    if (pathname === '/api/fonoran/word-generator' && method === 'POST') {
      const body = await readJsonBody(req);
      const lab = await getLab();
      return done(200, await generateWords(body.text ?? '', { components: body.components ?? null, lab }));
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
    const parseMatch = pathname.match(/^\/api\/fonoran\/lab\/parse\/([^/]+)$/);
    if (parseMatch && method === 'GET') {
      return done(200, await parseCompoundLive(decodeURIComponent(parseMatch[1])));
    }
    if (pathname === '/api/fonoran/lab/undo' && method === 'POST') {
      return done(200, await undoLast());
    }
    if (pathname === '/api/fonoran/lab/seed' && method === 'POST') {
      return done(200, await seedBucket());
    }
    if ((pathname === '/api/fonoran/lab/build' || pathname === '/api/fonoran/lab/import-vocabulary') && method === 'POST') {
      const body = await readJsonBody(req);
      return done(200, await buildFonoran({ approveAll: Boolean(body.approve_all) }));
    }
    if (pathname === '/api/fonoran/lab/reset-review' && method === 'POST') {
      return done(200, await resetReviewStates());
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
