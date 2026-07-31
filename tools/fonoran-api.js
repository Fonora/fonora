/**
 * Fonoran language API: file-backed store over the editorial seeds and the lab bucket.
 */

import {
  getLab,
  getHealth,
  loadBucket,
  getLabGraph,
  getLabGraphPreview,
  assignCompoundMeaning,
  addCompound,
  resetReviewStates,
  setReviewState,
  undoLast,
  recomposeCompound,
} from './fonoran-sound-bucket.js';
import { getLearnCoursePhrases } from './fonoran-learn-course-phrases.js';
import { resetProject } from './fonoran-reset.js';
import { loadEnglishLexicon } from './fonoran-english-lexicon.js';
import { translate } from './fonoran-translate.js';
import { buildAlignment } from './fonoran-alignment.js';
import { runTranslationGapReport, loadLatestGapReport } from './fonoran-translation-gaps.js';
import { loadParticles } from './fonoran-particles.js';
import { buildFonoran } from './fonoran-build.js';
import {
  getRootCandidates,
  getRootCandidate,
  patchRootCandidate,
  regenerateRootCandidate,
  reconcileInventoryFromLab,
} from './fonoran-root-store.js';
import { loadRuntimeConceptInventory } from './fonoran-concepts.js';
import {
  createConcept,
  deleteConcept,
  getConceptForEditor,
  patchConcept,
} from './fonoran-concept-store.js';
import {
  syncCompoundFromLab,
  syncCompoundGlossFromLab,
  updateCompoundEditorial,
} from './fonoran-editorial-sync.js';
import {
  getSessionUser,
  isAdminWriteRequired,
  isCommunityWriteRequired,
  isAdminUser,
  isCommunityUser,
  isRegenAdminRequired,
  adminRequiredResponse,
  unauthorizedResponse,
  communityRequiredResponse,
} from './fonoran-auth.js';
import {
  getLearnProgress,
  saveLearnProgress,
  mergeLearnProgress,
  setVote,
  getVoteAggregate,
  getUserVote,
  checkRateLimit,
  getUserAnalytics,
} from './fonoran-community-store.js';
import { analyzeWord, analysisDelta } from './fonoran-word-analysis.js';
import { listWordInventory, getWordDetail } from './fonoran-word-manager.js';
import {
  generateCandidates,
  loadCandidateContext,
} from './fonoran-expression-candidates.js';
import {
  listCompoundProposals,
  resolveCompoundProposal,
  getProposalStats,
} from './fonoran-compound-proposals.js';
import {
  getRegenStatus,
  runRegenerate,
  runTranslatorRegression,
} from './fonoran-regen.js';
import { sanitizeForJsonResponse } from '../js/utils.js';
import { sendBody } from './http-compress.js';

function writeJsonPayload(res, status, payload) {
  // `res.req` is the request Node already paired with this response, which saves
  // threading it through every caller just to read one header.
  sendBody(res.req, res, status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  }, payload);
}

export function jsonResponse(res, status, body) {
  writeJsonPayload(res, status, JSON.stringify(sanitizeForJsonResponse(body)));
}

/** Error responses: plain message string only (never pass Error objects). */
export function jsonErrorResponse(res, status, message) {
  const safe = String(message || 'Request failed').slice(0, 500);
  writeJsonPayload(res, status, JSON.stringify({ error: safe }));
}

export async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  return JSON.parse(raw);
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
  if (isCommunityWriteRequired(pathname, method) && !isCommunityUser(req)) {
    communityRequiredResponse(res);
    return true;
  }
  if (isAdminWriteRequired(pathname, method) && !isAdminUser(req)) {
    if (!isCommunityUser(req)) {
      unauthorizedResponse(res);
    } else {
      adminRequiredResponse(res);
    }
    return true;
  }
  if (isRegenAdminRequired(pathname, method) && !isAdminUser(req)) {
    adminRequiredResponse(res);
    return true;
  }
  try {
    if (pathname === '/api/fonoran/me/progress' && method === 'GET') {
      const user = getSessionUser(req);
      if (!user?.userId) return done(401, { error: 'Sign in required' });
      const { progress, updated_at } = await getLearnProgress(user.userId);
      return done(200, { progress, updated_at });
    }
    if (pathname === '/api/fonoran/me/progress' && method === 'PUT') {
      const user = getSessionUser(req);
      if (!user?.userId) return done(401, { error: 'Sign in required' });
      checkRateLimit(`progress:${user.userId}`, { max: 60 });
      const body = await readJsonBody(req);
      const remote = (await getLearnProgress(user.userId)).progress;
      const merged = mergeLearnProgress(body.progress ?? body, remote);
      const saved = await saveLearnProgress(user.userId, merged);
      return done(200, { progress: merged, updated_at: saved.updated_at });
    }
    if (pathname === '/api/fonoran/words' && method === 'GET') {
      const url = new URL(req.url ?? '', 'http://localhost');
      return done(200, await listWordInventory({
        filter: url.searchParams.get('filter') ?? 'all',
        query: url.searchParams.get('q') ?? '',
      }));
    }
    const wordDetailMatch = pathname.match(/^\/api\/fonoran\/words\/([^/]+)$/);
    if (wordDetailMatch && method === 'GET') {
      const ref = decodeURIComponent(wordDetailMatch[1]);
      const url = new URL(req.url ?? '', 'http://localhost');
      return done(200, await getWordDetail(ref, { kind: url.searchParams.get('kind') }));
    }
    const wordVoteMatch = pathname.match(/^\/api\/fonoran\/words\/([^/]+)\/vote$/);
    if (wordVoteMatch && method === 'GET') {
      const ref = decodeURIComponent(wordVoteMatch[1]);
      const aggregate = await getVoteAggregate('word', ref);
      const user = getSessionUser(req);
      const userVote = user?.userId ? await getUserVote(user.userId, 'word', ref) : 0;
      return done(200, { ...aggregate, userVote });
    }
    if (wordVoteMatch && method === 'POST') {
      const user = getSessionUser(req);
      if (!user?.userId) return done(401, { error: 'Sign in required' });
      checkRateLimit(`vote:${user.userId}`, { max: 120 });
      const ref = decodeURIComponent(wordVoteMatch[1]);
      const body = await readJsonBody(req);
      const vote = body.vote === 0 || body.vote == null ? 0 : body.vote > 0 ? 1 : -1;
      await setVote(user.userId, 'word', ref, vote);
      return done(200, { ...(await getVoteAggregate('word', ref)), userVote: vote });
    }
    if (pathname === '/api/fonoran/analyze/word' && method === 'POST') {
      const body = await readJsonBody(req);
      const lab = await getLab();
      const analysis = analyzeWord({ ...body, lab });
      let delta = null;
      if (body.compare_ref) {
        try {
          const existing = await getWordDetail(body.compare_ref);
          const baseline = analyzeWord({
            type: existing.kind === 'root' ? 'root' : 'compound',
            spelling: existing.spelling,
            components: existing.parts ?? existing.compound?.parts,
            meaning: existing.meaning,
            lab,
            candidate: existing.candidate,
          });
          delta = analysisDelta(baseline, analysis);
        } catch {
          /* ignore missing compare target */
        }
      }
      return done(200, { analysis, delta });
    }
    if (pathname === '/api/fonoran/bootstrap' && method === 'GET') {
      return done(200, await getBootstrap());
    }
    if (pathname === '/api/fonoran/learn/course-phrases' && method === 'GET') {
      const { payload, etag } = await getLearnCoursePhrases();
      const ifNoneMatch = req.headers?.['if-none-match'];
      if (ifNoneMatch && ifNoneMatch === etag) {
        res.writeHead(304, {
          ETag: etag,
          'Cache-Control': 'private, max-age=60',
        });
        res.end();
        return true;
      }
      const body = JSON.stringify(sanitizeForJsonResponse(payload));
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        ETag: etag,
        'Cache-Control': 'private, max-age=60',
      });
      res.end(body);
      return true;
    }
    if (pathname === '/api/fonoran/lexicon' && method === 'GET') {
      const lab = await getLab();
      return done(200, await loadEnglishLexicon(lab));
    }
    if (pathname === '/api/fonoran/concepts' && method === 'GET') {
      const lab = await getLab();
      return done(200, await loadRuntimeConceptInventory({ lab }));
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
      const url = new URL(req.url ?? '', 'http://localhost');
      const lab = await getLab();
      const result = await translate(body.text ?? '', {
        lab,
        sourceLang: body.sourceLang ?? url.searchParams.get('sourceLang') ?? 'auto',
        direction: body.direction ?? url.searchParams.get('direction') ?? undefined,
        inputMode: body.inputMode ?? url.searchParams.get('inputMode') ?? undefined,
        devLab: body.dev_lab === true
          || process.env.FONORAN_DEV_LAB === '1'
          || process.env.FONORAN_DEV_LAB === 'true',
      });
      if (result.ok === false) {
        return done(result.status ?? 503, {
          error: result.error,
          engine: result.engine ?? 'legacy',
          code: result.code,
          hint: result.hint,
        });
      }
      // Opt-in: only the phrase poster needs to know which English word each
      // token came from, and computing it costs a lemma per word.
      if (body.align === true && Array.isArray(result.tokens)) {
        return done(200, {
          ...result,
          alignment: buildAlignment(body.text ?? '', result.tokens),
        });
      }
      return done(200, result);
    }
    if (pathname === '/api/fonoran/grammar-particles' && method === 'GET') {
      return done(200, await loadParticles());
    }
    if (pathname === '/api/fonoran/compound-proposals' && method === 'GET') {
      const url = new URL(req.url ?? '', 'http://localhost');
      const status = url.searchParams.get('status') ?? 'open';
      const classification = url.searchParams.get('classification') ?? null;
      const limit = Number(url.searchParams.get('limit') ?? 200);
      const [proposals, stats] = await Promise.all([
        listCompoundProposals({ status, classification, limit }),
        getProposalStats(),
      ]);
      return done(200, { proposals, stats });
    }
    const compoundProposalMatch = pathname.match(/^\/api\/fonoran\/compound-proposals\/([^/]+)$/);
    if (compoundProposalMatch && method === 'PATCH') {
      const id = decodeURIComponent(compoundProposalMatch[1]);
      const body = await readJsonBody(req);
      const action = body.action; // accepted | rejected | skipped
      if (!['accepted', 'rejected', 'skipped'].includes(action)) {
        return done(400, { error: 'action must be accepted, rejected, or skipped' });
      }
      const user = getSessionUser(req);
      const proposal = await resolveCompoundProposal(id, action, {
        resolvedBy: user?.email ?? 'admin',
        note: body.note ?? null,
        chosenCompositionIndex: body.chosen_composition_index ?? null,
        chosenComposition: body.chosen_composition ?? null,
      });
      let editorial = null;
      if (action === 'accepted' && proposal.classification === 'compound' && proposal.chosen_composition?.length >= 2) {
        const conceptId = String(proposal.word ?? proposal.concept_id ?? '').trim().toLowerCase();
        if (conceptId) {
          editorial = await updateCompoundEditorial(conceptId, {
            composition: proposal.chosen_composition,
            gloss: proposal.rationale ?? proposal.gloss ?? '',
          });
        }
      }
      return done(200, { ...proposal, editorial });
    }
    if (pathname === '/api/fonoran/expressions/candidates' && method === 'POST') {
      const body = await readJsonBody(req);
      if (!body.concept_id) return done(400, { error: 'concept_id is required' });
      const ctx = await loadCandidateContext();
      const extra = Array.isArray(body.extra) ? body.extra : [];
      const candidates = generateCandidates(body.concept_id, {
        metaFor: ctx.metaFor,
        collisionCounts: ctx.collisionCounts,
        collisionCountFor: ctx.collisionCountFor,
        knownComposition: ctx.knownByConcept.get(body.concept_id),
        flatCountFor: ctx.flatCountFor,
        extraCompositions: extra,
      });
      return done(200, { concept_id: body.concept_id, candidates });
    }
    if (pathname === '/api/fonoran/translation-tests/latest' && method === 'GET') {
      return done(200, await loadLatestGapReport());
    }
    if (pathname === '/api/fonoran/translation-tests/run' && method === 'POST') {
      const body = await readJsonBody(req);
      const lab = await getLab();
      const level = body.level != null ? Number(body.level) : null;
      // suggest: attach offline WordNet curation suggestions to each gap so the
      // lab GUI / concept editor can propose aliases for human approval.
      return done(200, await runTranslationGapReport({ level, lab, suggest: true }));
    }
    if (pathname === '/api/fonoran/lab/health' && method === 'GET') {
      return done(200, await getHealth());
    }
    if (pathname === '/api/fonoran/admin/analytics' && method === 'GET') {
      if (!isAdminUser(req)) {
        adminRequiredResponse(res);
        return true;
      }
      return done(200, await getUserAnalytics());
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
    if (pathname === '/api/fonoran/lab/regen/status' && method === 'GET') {
      return done(200, await getRegenStatus());
    }
    if (pathname === '/api/fonoran/lab/regenerate' && method === 'POST') {
      const body = await readJsonBody(req);
      if (body.confirm !== 'REGENERATE') {
        return done(400, { error: 'Type REGENERATE in confirm field to run the full generator pipeline' });
      }
      return done(200, await runRegenerate({
        approveAll: body.approve_all !== false,
      }));
    }
    if (pathname === '/api/fonoran/lab/regression/translator' && method === 'POST') {
      const lab = await getLab();
      return done(200, await runTranslatorRegression({ lab }));
    }
    if (pathname === '/api/fonoran/lab/seed' && method === 'POST') {
      return done(200, await resetProject());
    }
    // The stale-seed guard that used to sit here compared the seeds against a Postgres copy of
    // them. A build now reads the seed files directly, so it cannot be stale by construction.
    if (pathname === '/api/fonoran/lab/build' && method === 'POST') {
      const body = await readJsonBody(req);
      return done(200, await buildFonoran({ approveAll: Boolean(body.approve_all) }));
    }
    if (pathname === '/api/fonoran/lab/reset-review' && method === 'POST') {
      return done(200, await resetReviewStates());
    }
    if (pathname === '/api/fonoran/lab/reconcile-inventory' && method === 'POST') {
      return done(200, await reconcileInventoryFromLab());
    }
    const stateMatch = pathname.match(/^\/api\/fonoran\/lab\/state\/(sound|compound)\/([^/]+)$/);
    if (stateMatch && method === 'PATCH') {
      const kind = stateMatch[1];
      const id = decodeURIComponent(stateMatch[2]);
      const body = await readJsonBody(req);
      return done(200, await setReviewState(kind, id, body.state));
    }
    const labCompoundMatch = pathname.match(/^\/api\/fonoran\/lab\/compounds\/([^/]+)$/);
    if (labCompoundMatch && method === 'PATCH') {
      const id = decodeURIComponent(labCompoundMatch[1]);
      const body = await readJsonBody(req);
      let compound;
      let editorial;
      if (Array.isArray(body.components) || Array.isArray(body.parts)) {
        compound = await recomposeCompound(id, body);
        editorial = await syncCompoundFromLab(compound);
      } else {
        compound = await assignCompoundMeaning(id, body.meaning, { state: body.state, aliases: body.aliases });
        editorial = await syncCompoundGlossFromLab(compound);
      }
      if (body.concept_id && editorial?.skipped) {
        const bucket = await loadBucket();
        const row = bucket.compounds.find(c => c.id === compound.id);
        if (row) {
          row.concept_id = String(body.concept_id).trim().toLowerCase();
          const { writeBucketRaw } = await import('./fonoran-store.js');
          await writeBucketRaw(bucket);
          compound.concept_id = row.concept_id;
          editorial = await syncCompoundFromLab(compound, bucket);
        }
      }
      if (typeof body.locked === 'boolean' && compound.concept_id) {
        const lockEditorial = await updateCompoundEditorial(compound.concept_id, { locked: body.locked });
        editorial = { ...editorial, ...lockEditorial };
      }
      return done(200, { ...compound, editorial });
    }
    if (pathname === '/api/fonoran/lab/compounds' && method === 'POST') {
      const body = await readJsonBody(req);
      const compound = await addCompound(body);
      let editorial = { seeds_written: false, skipped: true, reason: 'no concept_id' };
      if (compound.concept_id) {
        const bucket = await loadBucket();
        editorial = await syncCompoundFromLab(compound, bucket);
      }
      return done(201, { ...compound, editorial });
    }
    if (pathname === '/api/fonoran/roots/candidates' && method === 'GET') {
      const url = new URL(req.url ?? '', 'http://localhost');
      const status = url.searchParams.get('status');
      return done(200, await getRootCandidates({ status: status || null }));
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
      const body = await readJsonBody(req).catch(() => ({}));
      return done(200, await regenerateRootCandidate(id, { force: body?.force === true }));
    }
    return false;
  } catch (err) {
    console.error('Fonoran API error:', err);
    const status = err?.status >= 400 && err?.status < 600 ? err.status : 400;
    // A 4xx here is a validation message written for the person who caused it ("No syllable
    // available for concept: x", "Cannot delete an approved concept"). Replacing all of them
    // with "Request failed" meant the admin tools could report that something went wrong but
    // never what. 5xx stays generic, since an unexpected failure can carry internals.
    const message = status >= 500
      ? 'Internal server error'
      : (typeof err?.message === 'string' && err.message.trim()) || 'Request failed';
    jsonErrorResponse(res, status, message);
    return true;
  }
}
