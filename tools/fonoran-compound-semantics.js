/**
 * Deterministic semantic scoring for compounds. No LLM.
 *
 * The question a compound has to answer is whether a reader can get from the parts to the
 * meaning. Until now the only signal for that was an LLM playtest scored by exact string
 * match (strictGuessMatchesTarget), which asked whether the reader produced the English
 * headword verbatim rather than whether they understood. That metric ranked `world` as
 * whole+place+earth+life (melfelchefenfo, 2/16) above earth+life (fenfo, 0/8), because the
 * longer form contained "whole" and nudged the guess toward the literal word. Optimising
 * against it makes the language worse.
 *
 * This scores against something the project already owns and controls: each concept's own
 * gloss. A composition asserts that the concept is built from these parts, so the gloss
 * should bear that out. Where it does not, the gloss usually names the root that belongs
 * instead, which turns a vague "this compound feels wrong" into a specific swap:
 *
 *   elder     person+back   "an older person; one who came before"  -> back unattested, before named
 *   campfire  fire+near     "fire at a place"                        -> near unattested, place named
 *   world     earth+life    "whole place of earth and life"          -> both attested, no finding
 *
 * A gloss does not have to name its parts, so an unattested root is a question, not a
 * verdict. A swap that also crosses a domain boundary (a space root standing in for a time
 * one) is the stronger signal, because the seeds record each root's domain explicitly.
 */

/** Words too common to carry meaning when matching a root against a gloss. */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'from', 'with', 'and', 'or',
  'that', 'this', 'it', 'its', 'is', 'are', 'was', 'be', 'being', 'been', 'as', 'not', 'no',
  'one', 'who', 'whom', 'which', 'what', 'when', 'where', 'how', 'you', 'your', 'they',
  'someone', 'something', 'thing', 'things', 'other', 'another', 'more', 'most', 'own',
  'side', 'direction', 'away', 'toward', 'towards', 'into', 'onto', 'up', 'down', 'out',
  'has', 'have', 'having', 'can', 'may', 'will', 'would', 'about', 'over', 'under',
]);

/** Minimum token length considered a content word. */
const MIN_TOKEN = 3;

/**
 * @param {string} text
 * @returns {string[]}
 */
export function tokens(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(t => t.length >= MIN_TOKEN && !STOPWORDS.has(t));
}

/**
 * English suffixes that mark an inflection rather than a different word.
 *
 * Matching on a shared prefix alone is too loose: it reads "start" as the root `star`, and
 * proposing that `birth` be built from a celestial body is the kind of finding that makes an
 * editor stop trusting the whole report. Requiring the remainder to be an actual suffix
 * keeps know/knowing and old/older while rejecting star/start.
 */
const INFLECTIONS = ['s', 'es', 'ed', 'd', 'ing', 'er', 'est', 'ly', 'y', 'ion', 'ness'];

/**
 * Do two tokens refer to the same idea? Deliberately shallow, and legible when a finding
 * has to be explained to an editor.
 *
 * @param {string} a
 * @param {string} b
 */
export function sameIdea(a, b) {
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (shorter.length < 4 || !longer.startsWith(shorter)) return false;
  const remainder = longer.slice(shorter.length);
  return INFLECTIONS.includes(remainder);
}

/**
 * Is every word of a multi-word concept name present? `distant_place` must not count as
 * named by a gloss that only says "place", or every locative compound proposes a swap to
 * every other locative compound.
 *
 * @param {string[]} nameTokens
 * @param {string[]} glossTokens
 * @returns {string | null} the matched gloss word, or null
 */
function phraseMatch(nameTokens, glossTokens) {
  if (!nameTokens.length) return null;
  let evidence = null;
  for (const part of nameTokens) {
    const hit = glossTokens.find(g => sameIdea(g, part));
    if (!hit) return null;
    evidence ??= hit;
  }
  return evidence;
}

/**
 * Does a description say anything beyond the concept's own name?
 *
 * `plan` is glossed "plan" and `relieved` is glossed "relieved". Such a description cannot
 * check a composition, and it cannot pick a WordNet sense either: worse, it scores a perfect
 * match against any sense containing the headword, so it looks like the most confident result
 * in the set while carrying no information at all.
 *
 * @param {string} conceptId
 * @param {string} description
 */
export function isInformativeDescription(conceptId, description) {
  const conceptTokens = tokens(String(conceptId ?? '').replace(/_/g, ' '));
  const descriptionTokens = tokens(description);
  if (!descriptionTokens.length) return false;
  return descriptionTokens.some(d => !conceptTokens.some(c => sameIdea(d, c)));
}

/**
 * Vocabulary for one concept: the words that count as naming it.
 *
 * @param {string} id
 * @param {{ primitiveById: Map<string, object>, compoundById: Map<string, object>, aliases: Record<string, { label?: string, aliases?: string[] }> }} ctx
 * @returns {{ own: string[], described: string[] }} `own` are the concept's own names, `described` the words of its description
 */
function conceptVocabulary(id, ctx) {
  const primitive = ctx.primitiveById.get(id);
  const compound = ctx.compoundById.get(id);
  const localized = ctx.aliases?.[id] ?? {};
  // Each name is kept as its own word list, so a two-word name has to match in full.
  const own = [tokens(String(id).replace(/_/g, ' '))];
  const label = tokens(localized.label);
  if (label.length) own.push(label);
  // Aliases are kept apart from the concept's own name because they are much looser. `after`
  // carries the alias "next", so a gloss reading "next to" (spatial) matches a time root, and
  // `body` carries "form", so "forming a boundary" matches it. Evidence from an alias is
  // reported at lower confidence rather than dropped, since it is also what connects
  // "higher" to `up`.
  const aliasNames = [];
  for (const alias of localized.aliases ?? []) {
    const aliasTokens = tokens(alias);
    if (aliasTokens.length) aliasNames.push(aliasTokens);
  }
  const described = new Set();
  const description = primitive?.plain_description
    ?? primitive?.description
    ?? compound?.preferred?.gloss
    ?? '';
  for (const t of tokens(description)) described.add(t);
  return { own, aliasNames, described: [...described] };
}

/**
 * Is `rootId` named by `glossTokens`?
 *
 * @param {string} rootId
 * @param {string[]} glossTokens
 * @param {object} ctx
 * @returns {{ attested: boolean, via: 'name' | 'alias' | 'description' | null, matched: string | null }}
 */
function attestation(rootId, glossTokens, ctx) {
  const vocab = conceptVocabulary(rootId, ctx);
  for (const name of vocab.own) {
    const hit = phraseMatch(name, glossTokens);
    if (hit) return { attested: true, via: 'name', matched: hit };
  }
  for (const alias of vocab.aliasNames) {
    const hit = phraseMatch(alias, glossTokens);
    if (hit) return { attested: true, via: 'alias', matched: hit };
  }
  for (const word of vocab.described) {
    const hit = glossTokens.find(g => sameIdea(g, word));
    if (hit) return { attested: true, via: 'description', matched: hit };
  }
  return { attested: false, via: null, matched: null };
}

/**
 * Build the lookup tables the scorer needs.
 *
 * @param {{ inventory: object, compounds: object[], approvedRoots?: object[], localization?: object, dimensions?: object }} sources
 */
export function buildSemanticContext(sources) {
  const primitives = sources.inventory?.primitives ?? [];
  const primitiveById = new Map(primitives.map(p => [String(p.id), p]));
  const compoundById = new Map((sources.compounds ?? []).map(c => [String(c.concept), c]));
  const aliases = sources.localization?.entries ?? {};
  const domainById = new Map(primitives.map(p => [String(p.id), p.domain ?? null]));

  // Which roots own an orientation domain, read from the seeds rather than hand-listed, so
  // adding a time or space root does not need a second edit somewhere else.
  const rootsByDomain = new Map();
  for (const [id, domain] of domainById) {
    if (!domain) continue;
    if (!rootsByDomain.has(domain)) rootsByDomain.set(domain, []);
    rootsByDomain.get(domain).push(id);
  }

  return {
    primitiveById,
    compoundById,
    aliases,
    domainById,
    rootsByDomain,
    dimensions: sources.dimensions ?? null,
    /** concept -> the compositions already listed for it, so ranking can never invent one. */
    candidatesByConcept: sources.candidatesByConcept ?? {},
    /** Every concept a composition could legitimately name. */
    allConceptIds: [...new Set([...primitiveById.keys(), ...compoundById.keys()])],
  };
}

/**
 * Score one compound against its own gloss.
 *
 * @param {object} row a row from data/fonoran-compounds.json
 * @param {ReturnType<typeof buildSemanticContext>} ctx
 */
export function scoreCompound(row, ctx) {
  const concept = String(row?.concept ?? '');
  const composition = (row?.preferred?.composition ?? []).map(String);
  const gloss = String(row?.preferred?.gloss ?? '');
  const glossTokens = tokens(gloss);
  const conceptTokens = tokens(concept.replace(/_/g, ' '));

  // A gloss that only restates the headword ("breathe" glossed "breathe") says nothing about
  // how the concept is built, so it can neither support a root nor name a missing one. Scoring
  // it anyway produced the report's silliest suggestions, proposing that `breathe` be built
  // from `breath` and `relieved` from `relieved`. Report it as missing editorial data instead,
  // which is what it is.
  const informative = glossTokens.some(g => !conceptTokens.some(c => sameIdea(g, c)));
  if (!informative) {
    return {
      concept,
      composition,
      gloss,
      uninformative_gloss: true,
      support: [],
      supported_count: 0,
      total_count: composition.length,
      support_score: null,
      unsupported: [],
      gloss_named_absent: [],
      swaps: [],
      preferred_source: row?.preferred_source ?? row?.preferred?.source ?? null,
    };
  }

  const support = composition.map(rootId => ({
    root: rootId,
    ...attestation(rootId, glossTokens, ctx),
    domain: ctx.domainById.get(rootId) ?? null,
  }));
  const unsupported = support.filter(s => !s.attested);

  // Roots the gloss names but the composition leaves out. Restricted to concepts that could
  // actually appear in a composition, and to matches on the concept's own name rather than
  // its description, since a description-level match is too loose to propose as a swap.
  const inComposition = new Set(composition);
  const named = [];
  for (const id of ctx.allConceptIds) {
    // The concept cannot be a part of itself, and a gloss naturally restates its own headword.
    if (inComposition.has(id) || id === concept) continue;
    const hit = attestation(id, glossTokens, ctx);
    if (hit.attested && (hit.via === 'name' || hit.via === 'alias')) {
      named.push({
        root: id,
        matched: hit.matched,
        via: hit.via,
        domain: ctx.domainById.get(id) ?? null,
      });
    }
  }

  // A swap is worth proposing when the gloss names a root the composition omits while the
  // composition carries a root the gloss never names. Crossing an orientation domain
  // (space standing in for time, as in elder) is the strong form: the seeds state the
  // domain of both roots, so the mismatch is a fact rather than a reading.
  const swaps = [];
  for (const missing of named) {
    for (const extra of unsupported) {
      const crossesDomain = Boolean(
        missing.domain && extra.domain && missing.domain !== extra.domain,
      );
      // Confidence is about the evidence, not the conclusion. `high` means the gloss used the
      // missing root's own name and the swap moves between domains the seeds define, which is
      // the `elder` case: person+back glossed "one who came before". `low` means the only link
      // was an alias, where "next to" reaches the time root `after`.
      const confidence = missing.via === 'name'
        ? (crossesDomain ? 'high' : 'medium')
        : 'low';
      swaps.push({
        from: extra.root,
        to: missing.root,
        from_domain: extra.domain,
        to_domain: missing.domain,
        crosses_domain: crossesDomain,
        gloss_evidence: missing.matched,
        evidence_kind: missing.via,
        confidence,
      });
    }
  }
  const rank = { high: 0, medium: 1, low: 2 };
  swaps.sort((a, b) => rank[a.confidence] - rank[b.confidence]);

  return {
    concept,
    composition,
    gloss,
    support,
    supported_count: support.length - unsupported.length,
    total_count: support.length,
    /** 1 when every root in the composition is named by the concept's own gloss. */
    support_score: support.length ? (support.length - unsupported.length) / support.length : 1,
    unsupported: unsupported.map(s => s.root),
    gloss_named_absent: named.map(n => n.root),
    swaps,
    preferred_source: row?.preferred_source ?? row?.preferred?.source ?? null,
  };
}

/**
 * How well does one candidate composition match a gloss?
 *
 * Exported so candidate ranking can use gloss alignment as a scoring factor
 * (tools/fonoran-expression-candidates.js), not just the audit report.
 *
 * @param {string[]} composition
 * @param {string[]} glossTokens
 * @param {ReturnType<typeof buildSemanticContext>} ctx
 */
export function glossSupportFor(composition, glossTokens, ctx) {
  if (!composition.length) return { supported: 0, total: 0, score: 0, by_name: 0 };
  let supported = 0;
  let byName = 0;
  for (const rootId of composition) {
    const hit = attestation(rootId, glossTokens, ctx);
    if (!hit.attested) continue;
    supported += 1;
    if (hit.via === 'name') byName += 1;
  }
  return {
    supported,
    total: composition.length,
    score: supported / composition.length,
    by_name: byName,
  };
}

/**
 * Rank every candidate composition for a concept by how well its own gloss supports it.
 *
 * This is the signal worth acting on, and the reason is that it cross-checks two sources the
 * project maintains separately. Proposing a free-form swap from whatever the gloss happens to
 * mention invents pairings ("catch" is take+fast, its gloss mentions air, so swap take for
 * air), but asking which *already-listed* candidate the gloss describes is a narrow question
 * with a checkable answer. It also cannot invent vocabulary, since it only ever reorders the
 * candidate list a human already owns.
 *
 * The cases it finds are the ones that read wrong to a human: `elder` is person+back while its
 * gloss says "one who came before" and person+before is on the list; `family` is love+person
 * while its gloss says "persons bonded together" and person+bond is on the list.
 *
 * @param {object} row
 * @param {ReturnType<typeof buildSemanticContext>} ctx
 */
export function rankCandidatesByGloss(row, ctx) {
  const concept = String(row?.concept ?? '');
  const gloss = String(row?.preferred?.gloss ?? '');
  const glossTokens = tokens(gloss);
  const conceptTokens = tokens(concept.replace(/_/g, ' '));
  const informative = glossTokens.some(g => !conceptTokens.some(c => sameIdea(g, c)));

  const preferred = (row?.preferred?.composition ?? []).map(String);
  const key = comp => comp.join('+');
  const seen = new Set();
  const candidates = [];
  for (const comp of [preferred, ...(ctx.candidatesByConcept?.[concept] ?? []),
    ...((row?.alternates ?? []).map(a => (a?.composition ?? []).map(String)))]) {
    if (!comp?.length || seen.has(key(comp))) continue;
    seen.add(key(comp));
    candidates.push({ composition: comp, ...glossSupportFor(comp, glossTokens, ctx) });
  }

  // Prefer more roots supported outright, then more supported by the root's own name rather
  // than an alias, then the shorter composition.
  const ranked = [...candidates].sort((a, b) =>
    b.score - a.score
    || b.by_name - a.by_name
    || a.total - b.total);
  const best = ranked[0] ?? null;
  const current = candidates.find(c => key(c.composition) === key(preferred)) ?? null;
  const betterAvailable = Boolean(
    informative && best && current && best !== current && best.score > current.score,
  );

  return {
    concept,
    gloss,
    informative,
    preferred,
    current,
    best,
    ranked,
    better_available: betterAvailable,
    preferred_source: row?.preferred_source ?? row?.preferred?.source ?? null,
  };
}

/**
 * @param {object[]} compounds
 * @param {ReturnType<typeof buildSemanticContext>} ctx
 */
export function scoreAllCompounds(compounds, ctx) {
  return (compounds ?? []).map(row => scoreCompound(row, ctx));
}

/**
 * @param {object[]} compounds
 * @param {ReturnType<typeof buildSemanticContext>} ctx
 */
export function rankAllCandidates(compounds, ctx) {
  return (compounds ?? []).map(row => rankCandidatesByGloss(row, ctx));
}
