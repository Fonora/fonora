#!/usr/bin/env node
/**
 * Enforce the LLM quarantine boundary.
 *
 *   node scripts/fonoran-verify-llm-quarantine.js          report + exit 1 on violation
 *   node scripts/fonoran-verify-llm-quarantine.js --map    print the full dependency map
 *
 * The rule: a deterministic algorithm may never depend on LLM code or on data an
 * LLM produced. Deterministic output must be reproducible from seeds alone, which
 * is impossible if any step reads a cache some model wrote.
 *
 * The boundary is computed, not asserted by hand. Seeds are the files that talk to
 * a model provider; anything that imports them transitively is inside the
 * quarantine. A file inside the quarantine that is NOT listed in
 * data/fonoran-llm-quarantine.json is a violation, which is how a new dependency
 * gets caught the day it is written rather than the day someone audits it.
 */
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainModule } from '../tools/is-main.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SKIP_DIRS = new Set(['node_modules', '.git', 'external', 'coverage', 'dist']);

/** Provider-facing modules: the roots of everything LLM. */
const PROVIDER_RE = /\b(ANTHROPIC_API_KEY|OPENAI_API_KEY|api\.anthropic\.com|@anthropic-ai)\b/;

/** Data files an LLM wrote. Deterministic code must not read these. */
const LLM_DATA_RE = /fonoran-(translation-cache|llm-evaluations|llm-reliability|playtests|stranger-corpus|vocab-survey|persona-glossaries)[\w-]*\.json/;

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(join(dir, entry.name), out);
    } else if (/\.(js|mjs|cjs)$/.test(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

const IMPORT_RE = /(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function specifiersOf(source) {
  const found = new Set();
  for (const m of source.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (spec?.startsWith('.')) found.add(spec);
  }
  return [...found];
}

export async function buildGraph(seedRels = []) {
  const files = await walk(ROOT);
  /** @type {Map<string, { rel: string, imports: string[], provider: boolean, llmData: string[] }>} */
  const nodes = new Map();

  const selfPath = fileURLToPath(import.meta.url);

  for (const abs of files) {
    const source = await readFile(abs, 'utf8');
    const rel = relative(ROOT, abs);
    // The checker names the provider strings it hunts for, so it would flag itself.
    if (abs === selfPath) {
      nodes.set(abs, { rel, imports: [], provider: false, llmData: [] });
      continue;
    }
    const imports = specifiersOf(source)
      .map(spec => resolve(dirname(abs), spec))
      .map(p => (/\.(js|mjs|cjs)$/.test(p) ? p : `${p}.js`))
      .filter(p => files.includes(p));
    nodes.set(abs, {
      rel,
      imports,
      provider: PROVIDER_RE.test(source),
      llmData: [...new Set((source.match(LLM_DATA_RE) ?? []))],
    });
  }

  // Inside the quarantine = talks to a provider, is declared LLM-owned, or imports
  // something that is. Declared files must seed this too: a module can be LLM-owned
  // without calling a provider itself, and importing it is still crossing the line.
  const seeds = new Set(seedRels);
  const inside = new Set(
    [...nodes].filter(([, n]) => n.provider || seeds.has(n.rel)).map(([abs]) => abs),
  );
  let grew = true;
  while (grew) {
    grew = false;
    for (const [abs, node] of nodes) {
      if (inside.has(abs)) continue;
      if (node.imports.some(dep => inside.has(dep))) {
        inside.add(abs);
        grew = true;
      }
    }
  }

  return { nodes, inside };
}

/**
 * The declared boundary.
 *   quarantined  LLM-owned. May talk to a model.
 *   pending_cut  deterministic code that still reaches LLM code. A known bug, ratcheted:
 *                the checker fails on anything in neither list, so the set can only shrink.
 */
async function declared() {
  try {
    const doc = JSON.parse(await readFile(join(ROOT, 'data/fonoran-llm-quarantine.json'), 'utf8'));
    return {
      quarantined: new Set(doc.quarantined ?? []),
      pending: new Set(Object.keys(doc.pending_cut ?? {})),
    };
  } catch {
    return { quarantined: new Set(), pending: new Set() };
  }
}

export async function verifyQuarantine() {
  const { quarantined, pending } = await declared();
  const { nodes, inside } = await buildGraph(quarantined);

  const undeclared = [];
  const dataLeaks = [];
  const stale = [];
  const seen = new Set();

  for (const [abs, node] of nodes) {
    const known = quarantined.has(node.rel) || pending.has(node.rel);
    const touchesLlm = inside.has(abs) || node.llmData.length > 0;
    if (touchesLlm) seen.add(node.rel);

    if (inside.has(abs) && !known) {
      const via = node.provider
        ? 'calls a model provider directly'
        : `imports ${node.imports.filter(d => inside.has(d)).map(d => nodes.get(d).rel).join(', ')}`;
      undeclared.push({ rel: node.rel, via });
    }
    if (node.llmData.length && !known) {
      dataLeaks.push({ rel: node.rel, data: node.llmData });
    }
  }

  // A pending cut that no longer touches LLM code is finished work: the entry must go,
  // otherwise the list stops meaning anything.
  for (const rel of pending) if (!seen.has(rel)) stale.push(rel);

  return {
    undeclared,
    dataLeaks,
    stale,
    pendingCount: pending.size,
    insideCount: inside.size,
    total: nodes.size,
  };
}

if (isMainModule(import.meta.url)) {
  const showMap = process.argv.includes('--map');
  const { undeclared, dataLeaks, stale, pendingCount, insideCount, total } = await verifyQuarantine();

  if (showMap) console.log(`${insideCount} of ${total} JS files reach LLM code.\n`);

  if (undeclared.length) {
    console.log(`NEW LLM dependency in ${undeclared.length} file(s). Cut it, or declare it in data/fonoran-llm-quarantine.json:\n`);
    for (const v of undeclared) console.log(`  ${v.rel}\n      ${v.via}`);
    console.log('');
  }

  if (dataLeaks.length) {
    console.log(`NEW read of LLM-produced data in ${dataLeaks.length} file(s):\n`);
    for (const v of dataLeaks) console.log(`  ${v.rel}\n      ${v.data.join(', ')}`);
    console.log('');
  }

  if (stale.length) {
    console.log(`${stale.length} pending_cut entr(ies) no longer touch LLM code. Remove them from the manifest:\n`);
    for (const rel of stale) console.log(`  ${rel}`);
    console.log('');
  }

  if (undeclared.length || dataLeaks.length || stale.length) process.exit(1);

  console.log(
    pendingCount
      ? `LLM quarantine holding: no new dependencies. ${pendingCount} known cut(s) still pending (see data/fonoran-llm-quarantine.json).`
      : 'LLM quarantine clean: no deterministic code depends on LLM code or LLM output.',
  );
}
