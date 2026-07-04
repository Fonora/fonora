#!/usr/bin/env node
/**
 * Generate the 1,000-phrase stranger communication corpus via batched Claude calls.
 *
 * Run:
 *   node tools/fonoran-stranger-corpus-generate.js
 *   node tools/fonoran-stranger-corpus-generate.js --domain first_contact
 *   node tools/fonoran-stranger-corpus-generate.js --resume
 *   node tools/fonoran-stranger-corpus-generate.js --dry-run
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import '../load-env.js';
import { completeJson, anthropicConfigured, anthropicModel, estimateCallCost } from './fonoran-llm-client.js';
import { resolveDataPath } from './fonoran-data-paths.js';

const MAX_TOKENS = 8192;
const PHRASES_PER_DOMAIN = 50;

/** @type {Array<{ id: string, label: string, focus: string, examples: string, prefix: string }>} */
export const STRANGER_DOMAINS = [
  {
    id: 'first_contact',
    label: 'First contact & identity',
    focus: 'greeting, naming self, stranger/trust, peaceful intent',
    examples: 'hello, my name, I am a person, you are safe, I mean no harm',
    prefix: 'fc',
  },
  {
    id: 'immediate_needs',
    label: 'Immediate needs',
    focus: 'water, food, shelter, rest, warmth, basic survival',
    examples: 'I need water, we need shelter, I am hungry, let us rest',
    prefix: 'in',
  },
  {
    id: 'pain_injury',
    label: 'Pain & injury',
    focus: 'hurt, sick, bleeding, broken, medicine, healing',
    examples: 'I am hurt, my leg is broken, I feel sick, do you have medicine',
    prefix: 'pi',
  },
  {
    id: 'fear_danger',
    label: 'Fear & danger',
    focus: 'afraid, danger, safe, run, hide, animal threat, warning',
    examples: 'I am afraid, there is danger, we must run, an animal is near',
    prefix: 'fd',
  },
  {
    id: 'basic_emotion',
    label: 'Basic emotions',
    focus: 'happy, sad, angry, calm, lonely, relieved, worried',
    examples: 'I am happy, I feel sad, I am angry, I feel calm now',
    prefix: 'em',
  },
  {
    id: 'social_bond',
    label: 'Social bond',
    focus: 'friend, help, thank, sorry, promise, trust, together',
    examples: 'thank you, I am sorry, I will help you, we can be friends',
    prefix: 'sb',
  },
  {
    id: 'refusal_boundary',
    label: 'Refusal & boundaries',
    focus: 'no, stop, do not, mine, enough, leave me alone',
    examples: 'no, stop, do not touch that, this is mine, that is enough',
    prefix: 'rb',
  },
  {
    id: 'what_questions',
    label: 'What questions',
    focus: 'what is this, what happened, what do you want',
    examples: 'what is this, what is that, what happened here',
    prefix: 'wq',
  },
  {
    id: 'who_questions',
    label: 'Who questions',
    focus: 'who are you, who is that person, who needs help',
    examples: 'who are you, who is that, who is hurt',
    prefix: 'hq',
  },
  {
    id: 'where_questions',
    label: 'Where questions',
    focus: 'where is water, which way, location of things and people',
    examples: 'where is water, where are we, which way should we go',
    prefix: 'wh',
  },
  {
    id: 'when_questions',
    label: 'When questions',
    focus: 'when, now, soon, before, after, later — never why or how',
    examples: 'when will we leave, is it time to eat, we should go soon',
    prefix: 'tn',
  },
  {
    id: 'direction_motion',
    label: 'Direction & motion',
    focus: 'go, come, enter, leave, follow, wait, stay, move',
    examples: 'come here, go there, wait for me, follow me, stay here',
    prefix: 'dm',
  },
  {
    id: 'possession_trade',
    label: 'Possession & trade',
    focus: 'have, give, take, share, exchange, borrow, return',
    examples: 'I have this, give me that, we can share, take this food',
    prefix: 'pt',
  },
  {
    id: 'food_eating',
    label: 'Food & eating',
    focus: 'hungry, cook, raw, poison, full, taste, eat, drink',
    examples: 'this food is good, do not eat that, I am full, it tastes bad',
    prefix: 'fe',
  },
  {
    id: 'weather_environment',
    label: 'Weather & environment',
    focus: 'rain, cold night, fire, dark, wind, sun, storm',
    examples: 'it is raining, the night is cold, we need fire, it is dark',
    prefix: 'we',
  },
  {
    id: 'body_health',
    label: 'Body & health',
    focus: 'body parts, tired, strong, breathe, sleep, sick, well',
    examples: 'I am tired, my head hurts, I cannot sleep, I feel strong',
    prefix: 'bh',
  },
  {
    id: 'family_children',
    label: 'Family & children',
    focus: 'child, mother, father, baby, old person, family',
    examples: 'where is my child, the baby is crying, my mother is sick',
    prefix: 'fa',
  },
  {
    id: 'repair_clarify',
    label: 'Repair & clarification',
    focus: 'repeat, slow, point, mean, wrong, understand, again',
    examples: 'I do not understand, say that again, do you mean this, that is wrong',
    prefix: 'rc',
  },
  {
    id: 'plans_intent',
    label: 'Plans & intent',
    focus: 'want, will, can, try, maybe, plan, hope',
    examples: 'I want to leave, we will rest here, can you help, maybe tomorrow',
    prefix: 'pl',
  },
  {
    id: 'closure_gratitude',
    label: 'Closure & gratitude',
    focus: 'goodbye, see you, enough for today, thank you, peace',
    examples: 'goodbye, we are safe now, that is enough for today, rest well',
    prefix: 'cg',
  },
];

const SYSTEM_PROMPT = [
  'You generate English phrases for a constructed-language gap test.',
  'Two adults from completely different backgrounds are stranded together with no shared language.',
  'They must coordinate survival, emotion, boundaries, and repair within the first week.',
  '',
  'Output ONLY valid JSON. No markdown fences, no commentary.',
  '',
  'Hard rules for every phrase:',
  '- Simple English, 3–12 words, ending punctuation (. or ?)',
  '- No idioms, slang, or culture-specific references (no Christmas, dollar, phone, etc.)',
  '- No proper nouns except generic roles (the child, the old person)',
  '- NEVER use why or how questions (those concepts are intentionally absent from the target language)',
  '- Each phrase must be something a real stranger would plausibly say or think aloud',
  '',
  'Utterance mix for the batch (approximately):',
  '- 35% statements/observations (type: statement)',
  '- 25% questions (type: question) — but never why/how',
  '- 20% requests/offers (type: request)',
  '- 15% feelings/inner states (type: feeling)',
  '- 5% repair/meta-communication (type: repair)',
  '',
  'complexity: 1 = single clause, 2 = simple modifier, 3 = coordination (e.g. "I am cold and hungry")',
].join('\n');

function buildDomainPrompt(domain, existingPhrases) {
  const avoidBlock = existingPhrases.length
    ? `\nDo NOT repeat or closely paraphrase these existing phrases:\n${existingPhrases.slice(-120).map(p => `- ${p}`).join('\n')}\n`
    : '';

  return [
    `Domain: ${domain.label}`,
    `Focus: ${domain.focus}`,
    `Example topics: ${domain.examples}`,
    avoidBlock,
    `Generate exactly ${PHRASES_PER_DOMAIN} unique English phrases for this domain.`,
    '',
    'Respond with JSON:',
    '{',
    '  "phrases": [',
    '    {',
    `      "id": "${domain.prefix}-001",`,
    '      "en": "Hello.",',
    '      "type": "statement",',
    '      "complexity": 1',
    '    }',
    '  ]',
    '}',
    '',
    `Use ids ${domain.prefix}-001 through ${domain.prefix}-${String(PHRASES_PER_DOMAIN).padStart(3, '0')}.`,
    `Set domain to "${domain.id}" on every phrase object.`,
  ].join('\n');
}

function normalizeEn(en) {
  return String(en ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

const IDIOM_OR_CULTURE = /\b(christmas|thanksgiving|dollar|euro|smartphone|iphone|wifi|internet|facebook|god bless|break a leg|piece of cake)\b/i;
const WHY_HOW = /^\s*(why|how)\b/i;

function filterPhrase(phrase, domain, seen, acceptedCount = 0) {
  const en = String(phrase?.en ?? '').trim();
  if (!en || en.length < 3) return { ok: false, reason: 'empty or too short' };
  const words = en.split(/\s+/).length;
  if (words > 12) return { ok: false, reason: 'too long' };
  if (WHY_HOW.test(en)) return { ok: false, reason: 'why/how question' };
  if (IDIOM_OR_CULTURE.test(en)) return { ok: false, reason: 'idiom or culture-specific' };
  const key = normalizeEn(en);
  if (seen.has(key)) return { ok: false, reason: 'duplicate' };
  seen.add(key);
  const type = ['statement', 'question', 'request', 'feeling', 'repair'].includes(phrase.type)
    ? phrase.type
    : 'statement';
  const complexity = [1, 2, 3].includes(Number(phrase.complexity)) ? Number(phrase.complexity) : 1;
  const id = phrase.id ?? `${domain.prefix}-${String(acceptedCount + 1).padStart(3, '0')}`;
  return {
    ok: true,
    phrase: { id, en, type, domain: domain.id, complexity },
  };
}

async function loadExistingCorpus(path) {
  try {
    const raw = JSON.parse(await readFile(path, 'utf8'));
    return raw;
  } catch {
    return null;
  }
}

function collectExistingPhrases(doc) {
  const phrases = [];
  for (const d of doc?.domains ?? []) {
    for (const p of d.phrases ?? []) phrases.push(p.en);
  }
  return phrases;
}

async function generateDomain(domain, seen, existingPhrases, dryRun) {
  if (dryRun) {
    console.log(`  [dry-run] would generate ${PHRASES_PER_DOMAIN} phrases for ${domain.id}`);
    return { phrases: [], skipped: false };
  }

  const user = buildDomainPrompt(domain, existingPhrases);
  const result = await completeJson({
    system: SYSTEM_PROMPT,
    user,
    temperature: 0.7,
    maxTokens: MAX_TOKENS,
  });

  if (!result.ok) {
    throw new Error(result.error ?? 'LLM request failed');
  }

  const rawPhrases = result.data?.phrases ?? [];
  const accepted = [];
  let rejected = 0;

  for (const p of rawPhrases) {
    const check = filterPhrase(p, domain, seen, accepted.length);
    if (!check.ok) {
      rejected += 1;
      continue;
    }
    accepted.push(check.phrase);
  }

  console.log(`  LLM returned ${rawPhrases.length}, accepted ${accepted.length}, rejected ${rejected}`);
  return { phrases: accepted, skipped: false };
}

async function writeCorpus(path, domains, meta = {}) {
  const total = domains.reduce((n, d) => n + (d.phrases?.length ?? 0), 0);
  const doc = {
    version: '1.0',
    description: 'Two-stranger first-week communication corpus for Fonoran gap testing',
    generated_at: new Date().toISOString(),
    model: anthropicModel(),
    total_phrases: total,
    domains,
    ...meta,
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  return doc;
}

function parseArgs(argv) {
  const domainIdx = argv.indexOf('--domain');
  return {
    dryRun: argv.includes('--dry-run'),
    resume: argv.includes('--resume'),
    onlyDomain: domainIdx !== -1 ? argv[domainIdx + 1] : null,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const { dryRun, resume, onlyDomain } = parseArgs(argv);

  if (!dryRun && !anthropicConfigured()) {
    throw new Error('ANTHROPIC_API_KEY not set (add to .env)');
  }

  const outPath = resolveDataPath('stranger_corpus');
  const existing = resume ? await loadExistingCorpus(outPath) : null;
  const seen = new Set(collectExistingPhrases(existing).map(normalizeEn));
  const domainMap = new Map();

  for (const d of existing?.domains ?? []) {
    domainMap.set(d.id, { id: d.id, label: d.label, phrases: [...(d.phrases ?? [])] });
  }

  const domainsToRun = onlyDomain
    ? STRANGER_DOMAINS.filter(d => d.id === onlyDomain)
    : STRANGER_DOMAINS;

  if (onlyDomain && !domainsToRun.length) {
    throw new Error(`Unknown domain: ${onlyDomain}`);
  }

  const costPer = estimateCallCost({ inputTokens: 3000, outputTokens: 4000 });
  console.log(`Stranger corpus generator — ${domainsToRun.length} domain(s), model ${anthropicModel()}`);
  if (!dryRun) console.log(`Estimated cost: ~$${(costPer * domainsToRun.length).toFixed(2)}`);

  for (const domain of domainsToRun) {
    const existingDomain = domainMap.get(domain.id);
    if (resume && existingDomain?.phrases?.length >= PHRASES_PER_DOMAIN) {
      console.log(`\n[skip] ${domain.id} — already has ${existingDomain.phrases.length} phrases`);
      continue;
    }

    console.log(`\n[${'='.repeat(50)}]`);
    console.log(`Domain: ${domain.label} (${domain.id})`);

    const { phrases: newPhrases } = await generateDomain(domain, seen, collectExistingPhrases(existing), dryRun);
    const merged = [...(existingDomain?.phrases ?? []), ...newPhrases];
    domainMap.set(domain.id, {
      id: domain.id,
      label: domain.label,
      phrases: merged.slice(0, PHRASES_PER_DOMAIN),
    });
  }

  if (dryRun) {
    console.log('\nDry run complete.');
    return;
  }

  const domains = STRANGER_DOMAINS.map(d => domainMap.get(d.id) ?? { id: d.id, label: d.label, phrases: [] });
  const doc = await writeCorpus(outPath, domains);
  console.log(`\nWrote ${doc.total_phrases} phrases to ${outPath}`);

  if (doc.total_phrases < 1000) {
    console.warn(`Warning: expected 1000 phrases, got ${doc.total_phrases}. Re-run with --resume to fill gaps.`);
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
