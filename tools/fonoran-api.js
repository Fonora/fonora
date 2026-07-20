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
import { translate } from './fonoran-translate.js';
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
  isSnapshotAdminRequired,
  isRegenAdminRequired,
  adminRequiredResponse,
  unauthorizedResponse,
  communityRequiredResponse,
} from './fonoran-auth.js';
import {
  getLearnProgress,
  saveLearnProgress,
  mergeLearnProgress,
  createProposal,
  listProposals,
  getProposal,
  resolveProposal,
  setVote,
  getVoteAggregate,
  getUserVote,
  checkRateLimit,
  getUserAnalytics,
} from './fonoran-community-store.js';
import { analyzeWord, analysisDelta } from './fonoran-word-analysis.js';
import { listWordInventory, getWordDetail, acceptProposal } from './fonoran-word-manager.js';
import {
  createSnapshotZipStream,
  getSnapshotStatus,
  importSnapshotZip,
  previewSnapshotZip,
  exportSnapshotToDir,
} from './fonoran-snapshot.js';
import {
  buildPuzzleChallenge,
  recordPlaytestFeedback,
  recordPlaytestRound,
  summarizePlaytests,
  buildPlaytestPromotionCandidates,
} from './fonoran-playtests.js';
import {
  generateCandidates,
  loadCandidateContext,
} from './fonoran-expression-candidates.js';
import { proposeLlmCandidates } from './fonoran-llm-candidates.js';
import {
  listCompoundProposals,
  resolveCompoundProposal,
  createCompoundProposals,
  getProposalStats,
} from './fonoran-compound-proposals.js';
import { analyzeGap, analyzeGaps } from './fonoran-gap-analyzer.js';
import {
  getRegenStatus,
  runRegenerate,
  optimizeCompoundsInStore,
  runTranslatorRegression,
} from './fonoran-regen.js';
import { importEditorialFromSeedPaths } from './fonoran-store.js';
import { sanitizeForJsonResponse } from '../js/utils.js';
import {
  getLlmPipelineStatus,
  getLlmPipelineJob,
  startLlmPipelineJob,
  getConfusabilityResult,
} from './fonoran-llm-pipeline.js';

function writeJsonPayload(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(payload);
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
  if (isSnapshotAdminRequired(pathname, method) && !isAdminUser(req)) {
    adminRequiredResponse(res);
    return true;
  }
  if (isRegenAdminRequired(pathname, method) && !isAdminUser(req)) {
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
        console.error('Snapshot export failed:', err);
        if (!res.headersSent) {
          jsonErrorResponse(res, 500, 'Export failed');
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
      const current = body.compare_ref
        ? analyzeWord({ ...body, lab })
        : null;
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
      return done(200, { analysis, delta, current });
    }
    if (pathname === '/api/fonoran/proposals' && method === 'GET') {
      const url = new URL(req.url ?? '', 'http://localhost');
      return done(200, {
        proposals: await listProposals({
          status: url.searchParams.get('status') ?? 'open',
          limit: Number(url.searchParams.get('limit') ?? 100),
        }),
      });
    }
    if (pathname === '/api/fonoran/proposals' && method === 'POST') {
      const user = getSessionUser(req);
      if (!user?.userId) return done(401, { error: 'Sign in required' });
      checkRateLimit(`proposal:${user.userId}`, { max: 30 });
      const body = await readJsonBody(req);
      if (!body.target_type || !body.target_ref || !body.kind) {
        return done(400, { error: 'target_type, target_ref, and kind are required' });
      }
      const proposal = await createProposal(user.userId, body);
      return done(201, proposal);
    }
    const proposalMatch = pathname.match(/^\/api\/fonoran\/proposals\/([^/]+)$/);
    if (proposalMatch && method === 'GET') {
      const proposal = await getProposal(decodeURIComponent(proposalMatch[1]));
      if (!proposal) return done(404, { error: 'Proposal not found' });
      const votes = await getVoteAggregate('proposal', proposal.id);
      return done(200, { proposal, votes });
    }
    const proposalVoteMatch = pathname.match(/^\/api\/fonoran\/proposals\/([^/]+)\/vote$/);
    if (proposalVoteMatch && method === 'POST') {
      const user = getSessionUser(req);
      if (!user?.userId) return done(401, { error: 'Sign in required' });
      checkRateLimit(`vote:${user.userId}`, { max: 120 });
      const id = decodeURIComponent(proposalVoteMatch[1]);
      const body = await readJsonBody(req);
      const vote = body.vote === 0 || body.vote == null ? 0 : body.vote > 0 ? 1 : -1;
      await setVote(user.userId, 'proposal', id, vote);
      return done(200, { ...(await getVoteAggregate('proposal', id)), userVote: vote });
    }
    const proposalResolveMatch = pathname.match(/^\/api\/fonoran\/proposals\/([^/]+)\/resolve$/);
    if (proposalResolveMatch && method === 'POST') {
      const user = getSessionUser(req);
      if (!isAdminUser(req)) {
        adminRequiredResponse(res);
        return true;
      }
      const id = decodeURIComponent(proposalResolveMatch[1]);
      const body = await readJsonBody(req);
      const proposal = await getProposal(id);
      if (!proposal) return done(404, { error: 'Proposal not found' });
      if (body.action === 'accept') {
        await acceptProposal(proposal, user.email);
        return done(200, { ok: true, status: 'accepted' });
      }
      if (body.action === 'reject') {
        await resolveProposal(id, { status: 'rejected', resolvedBy: user.email });
        return done(200, { ok: true, status: 'rejected' });
      }
      return done(400, { error: 'action must be accept or reject' });
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
      const url = new URL(req.url ?? '', 'http://localhost');
      const lab = await getLab();
      const engine = body.engine ?? url.searchParams.get('engine') ?? undefined;
      const simplifyRaw = body.simplify ?? url.searchParams.get('simplify') ?? undefined;
      const simplify = simplifyRaw === 'auto' ? 'auto'
        : simplifyRaw === true || simplifyRaw === 'true' ? true
          : simplifyRaw === false || simplifyRaw === 'false' ? false
            : undefined;
      const result = await translate(body.text ?? '', {
        lab,
        sourceLang: body.sourceLang ?? url.searchParams.get('sourceLang') ?? 'auto',
        targetLang: body.targetLang ?? url.searchParams.get('targetLang') ?? 'en',
        direction: body.direction ?? url.searchParams.get('direction') ?? undefined,
        inputMode: body.inputMode ?? url.searchParams.get('inputMode') ?? undefined,
        engine,
        skipCache: body.skipCache === true,
        simplify,
        devLab: body.dev_lab === true
          || process.env.FONORAN_DEV_LAB === '1'
          || process.env.FONORAN_DEV_LAB === 'true',
      });
      if (result.ok === false) {
        return done(result.status ?? 503, {
          error: result.error,
          engine: result.engine ?? 'llm',
          code: result.code,
          hint: result.hint,
        });
      }
      return done(200, result);
    }
    if (pathname === '/api/fonoran/grammar-particles' && method === 'GET') {
      return done(200, await loadParticles());
    }
    if (pathname === '/api/fonoran/puzzle/challenge' && method === 'GET') {
      const url = new URL(req.url ?? '', 'http://localhost');
      const coreOnly = ['1', 'true', 'yes'].includes((url.searchParams.get('core') ?? '').toLowerCase());
      const missed = url.searchParams.has('missed');
      const conceptId = missed ? null : url.searchParams.get('concept');
      const missedIndex = missed ? Number(url.searchParams.get('index') ?? 0) : null;
      const lab = await getLab();
      return done(200, await buildPuzzleChallenge({
        lab,
        coreOnly,
        conceptId: conceptId || null,
        missedIndex,
      }));
    }
    if (pathname === '/api/fonoran/puzzle/guess' && method === 'POST') {
      const body = await readJsonBody(req);
      if (body.feedback_only) {
        return done(200, await recordPlaytestFeedback(body));
      }
      return done(200, await recordPlaytestRound(body));
    }
    if (pathname === '/api/fonoran/puzzle/feedback' && method === 'POST') {
      const body = await readJsonBody(req);
      return done(200, await recordPlaytestFeedback(body));
    }
    if (pathname === '/api/fonoran/playtests/summary' && method === 'GET') {
      return done(200, await summarizePlaytests());
    }
    if (pathname === '/api/fonoran/playtests/promotions' && method === 'GET') {
      const url = new URL(req.url ?? '', 'http://localhost');
      const minRounds = Number(url.searchParams.get('min_rounds') ?? 3);
      const minRate = Number(url.searchParams.get('min_rate') ?? 0.7);
      return done(200, {
        promotions: await buildPlaytestPromotionCandidates({ minRounds, minRecoveryRate: minRate }),
      });
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
    if (pathname === '/api/fonoran/gaps/suggest' && method === 'POST') {
      const body = await readJsonBody(req);
      const word = body.word;
      const role = body.role ?? 'concept';
      if (!word) return done(400, { error: 'word is required' });
      const [inv, compoundsDoc] = await Promise.all([
        import('./fonoran-concepts.js').then(m => m.loadConceptInventory()),
        import('./fonoran-store.js').then(m => m.readDoc('compounds')),
      ]);
      const primitiveIds = (inv?.concepts ?? []).map(c => c.id);
      const compoundDefs = compoundsDoc?.compounds ?? [];
      const analysis = await analyzeGap(word, role, primitiveIds, compoundDefs, inv);
      // Persist as a proposal if valid — use word as the concept_id so
      // getAcceptedCompositionSeeds can index it into generateCandidates.
      let created = null;
      if (analysis.classification !== 'unknown') {
        const records = await createCompoundProposals([{
          ...analysis,
          concept_id: analysis.concept_id ?? word.toLowerCase().replace(/\s+/g, '_'),
        }]);
        created = records[0] ?? null;
      }
      return done(200, { analysis, proposal: created });
    }
    if (pathname === '/api/fonoran/expressions/candidates' && method === 'POST') {
      const body = await readJsonBody(req);
      if (!body.concept_id) return done(400, { error: 'concept_id is required' });
      const ctx = await loadCandidateContext();
      let extra = Array.isArray(body.extra) ? body.extra : [];
      if (body.llm) {
        const compound = ctx.compoundsDoc?.compounds?.find(c => c.concept === body.concept_id);
        const gloss = compound?.preferred?.gloss ?? compound?.gloss ?? body.concept_id;
        const llmExtra = await proposeLlmCandidates(body.concept_id, {
          gloss,
          primitiveIds: ctx.primitiveIds,
          compoundDefs: ctx.compoundsDoc?.compounds ?? [],
          maxFlattened: body.max_flattened ?? 4,
        });
        extra = [...extra, ...llmExtra];
      }
      const candidates = generateCandidates(body.concept_id, {
        metaFor: ctx.metaFor,
        collisionCounts: ctx.collisionCounts,
        knownComposition: ctx.knownByConcept.get(body.concept_id),
        flatCountFor: ctx.flatCountFor,
        extraCompositions: extra,
      });
      return done(200, { concept_id: body.concept_id, candidates });
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
      // Admin Translation Test mirrors the live app: LLM engine (cache-first,
      // API on miss), so the report reflects what users actually get.
      // suggest: attach offline WordNet curation suggestions to each gap so the
      // lab GUI / concept editor can propose aliases for human approval.
      return done(200, await runTranslationGapReport({ level, lab, engine: 'llm', suggest: true }));
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
    if (pathname === '/api/fonoran/lab/regen/status' && method === 'GET') {
      return done(200, await getRegenStatus());
    }
    if (pathname === '/api/fonoran/llm-pipeline/status' && method === 'GET') {
      const confusability = await getConfusabilityResult();
      return done(200, await getLlmPipelineStatus({ confusabilityCache: confusability }));
    }
    const pipelineJobMatch = pathname.match(/^\/api\/fonoran\/llm-pipeline\/job\/([^/]+)$/);
    if (pipelineJobMatch && method === 'GET') {
      const job = getLlmPipelineJob(decodeURIComponent(pipelineJobMatch[1]));
      if (!job) return done(404, { error: 'Job not found' });
      return done(200, job);
    }
    if (pathname === '/api/fonoran/llm-pipeline/run' && method === 'POST') {
      const body = await readJsonBody(req);
      const step = String(body.step ?? '').trim();
      if (!step) return done(400, { error: 'step is required' });
      try {
        return done(202, await startLlmPipelineJob(step, {
          reviewAcknowledged: Boolean(body.review_acknowledged),
          spotCheck: Boolean(body.spot_check),
        }));
      } catch (err) {
        return done(err.status ?? 400, { error: err.message });
      }
    }
    if (pathname === '/api/fonoran/lab/editorial/import' && method === 'POST') {
      const body = await readJsonBody(req);
      if (body.confirm !== 'IMPORT') {
        return done(400, { error: 'Type IMPORT in confirm field to reload editorial seeds from deploy' });
      }
      return done(200, await importEditorialFromSeedPaths());
    }
    if (pathname === '/api/fonoran/editorial/export-seeds' && method === 'POST') {
      const summary = await exportSnapshotToDir();
      return done(200, { exported: true, ...summary });
    }
    if (pathname === '/api/fonoran/lab/optimize-compounds' && method === 'POST') {
      const body = await readJsonBody(req);
      return done(200, await optimizeCompoundsInStore({
        useLlm: body.use_llm !== false,
        lengthOnly: Boolean(body.length_only),
      }));
    }
    if (pathname === '/api/fonoran/lab/regenerate' && method === 'POST') {
      const body = await readJsonBody(req);
      if (body.confirm !== 'REGENERATE') {
        return done(400, { error: 'Type REGENERATE in confirm field to run the full generator pipeline' });
      }
      return done(200, await runRegenerate({
        applyLlm: body.apply_llm === true,
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
    if ((pathname === '/api/fonoran/lab/build' || pathname === '/api/fonoran/lab/import-vocabulary') && method === 'POST') {
      const body = await readJsonBody(req);
      if (!body.force) {
        const status = await getRegenStatus();
        const stale = status.warnings?.some(w => w.code === 'lab_newer_than_seeds' || w.code === 'never_imported_seeds');
        if (stale && status.storage_mode === 'postgres') {
          return done(409, {
            error: 'Editorial seeds are stale. Use Regenerate from git seeds in Advanced, or pass force: true with confirm BUILD.',
          });
        }
      }
      if (body.force && body.confirm !== 'BUILD') {
        return done(400, { error: 'Type BUILD in confirm field to force rebuild without reloading seeds' });
      }
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
      const body = await readJsonBody(req).catch(() => ({}));
      return done(200, await regenerateRootCandidate(id, { force: body?.force === true }));
    }
    return false;
  } catch (err) {
    console.error('Fonoran API error:', err);
    const status = err?.status >= 400 && err?.status < 600 ? err.status : 400;
    jsonErrorResponse(res, status, status >= 500 ? 'Internal server error' : 'Request failed');
    return true;
  }
}
