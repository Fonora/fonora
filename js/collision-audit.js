/**
 * Fonora symbol collision audit — inventory, exact/concat collisions,
 * greedy decoder hazards, and word-level round-trip checks.
 */
import { textToIpa, initEspeak } from './ipa.js';
import { normalizeIpa } from './ipa-normalize.js';
import { ipaPhonemesToFonora } from './ipa-to-fonora.js';
import {
  getEncodableEntries,
  getDecodableEntries,
  getDefinedSounds,
  buildSoundToSymbolsMap,
} from './rules.js';
import { decodeSymbols, decodeToPhonemeKeys } from './decode.js';
import { encodeSounds } from './encode.js';
import { V2_COLLISION_GROUPS } from './vowel-v2-collision-groups.js';

const CONCAT_MAX_LEN = 2;

function sameLengthSequences(seqs, len) {
  return seqs.filter((s) => s.length === len);
}

function uniqueSequences(seqs) {
  const seen = new Set();
  return seqs.filter((s) => {
    const id = s.join('\0');
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function entryType(cell) {
  if (cell.modifierId && cell.placeId) return 'grid';
  if (cell.composition) return 'derived';
  if (cell.recipe || cell.lexicalSet) return 'vowel';
  if (cell.aliasOf) return 'alias';
  return cell.status === 'reserved' ? 'reserved' : 'other';
}

function entrySource(cell) {
  if (cell.modifierId) return `sound grid (${cell.modifierId}+${cell.placeId})`;
  if (cell.composition) return `derived (${cell.composition})`;
  if (cell.recipe) return 'vowel recipe';
  return 'language-rules.md';
}

/** @param {object} rules */
export function buildSymbolInventory(rules) {
  const encodable = getEncodableEntries(rules);
  const decodable = getDecodableEntries(rules);
  const reserved = (rules.soundGrid || []).filter((c) => c.status === 'reserved');
  const seen = new Set();

  const rows = [];

  function add(cell, encodableFlag) {
    const key = cell.sound || cell.key || '?';
    const id = `${key}|${cell.symbols}|${cell.status}`;
    if (seen.has(id)) return;
    seen.add(id);
    rows.push({
      key,
      type: entryType(cell),
      ipa: cell.ipa || '',
      symbols: cell.symbols || '',
      source: entrySource(cell),
      status: cell.status || 'defined',
      encodable: encodableFlag,
      notes: cell.explanation || cell.example || cell.lexicalSet || '',
    });
  }

  for (const cell of encodable) add(cell, true);
  for (const cell of decodable) add(cell, encodable.some((e) => e.symbols === cell.symbols && e.sound === cell.sound));
  for (const cell of reserved) add(cell, false);

  if (rules.ipaVowelMap) {
    for (const [ipa, mapped] of Object.entries(rules.ipaVowelMap)) {
      const keys = Array.isArray(mapped) ? mapped : [mapped];
      rows.push({
        key: keys.join('/'),
        type: 'ipa mapping',
        ipa,
        symbols: '(via phoneme key)',
        source: 'ipa supplemental / vowel map',
        status: 'defined',
        encodable: false,
        notes: `IPA ${ipa} → phoneme key ${keys.join(', ')}`,
      });
    }
  }

  return rows.sort((a, b) => a.key.localeCompare(b.key) || a.type.localeCompare(b.type));
}

/** @param {object[]} inventory */
export function findExactCollisions(inventory) {
  const bySymbols = new Map();
  for (const row of inventory) {
    if (!row.symbols || row.symbols === '(via phoneme key)' || row.status === 'reserved') continue;
    if (!bySymbols.has(row.symbols)) bySymbols.set(row.symbols, []);
    bySymbols.get(row.symbols).push(row);
  }

  return [...bySymbols.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([symbols, rows]) => ({
      symbols,
      keys: rows.map((r) => r.key),
      types: rows.map((r) => r.type),
      severity: rows.every((r) => r.key === rows[0].key) ? 'documentation' : 'fatal',
      recommendation:
        rows.every((r) => r.key === rows[0].key)
          ? 'Document alias only'
          : 'Language-design decision required — distinct phoneme keys share one symbol string',
    }));
}

function sequencesUpToLength(sounds, maxLen) {
  const out = [];
  function walk(prefix, depth) {
    if (depth > 0) out.push([...prefix]);
    if (depth >= maxLen) return;
    for (const s of sounds) walk([...prefix, s], depth + 1);
  }
  walk([], 0);
  return out;
}

/** @param {object} rules */
export function findConcatenationCollisions(rules, maxLen = CONCAT_MAX_LEN) {
  const map = buildSoundToSymbolsMap(rules);
  const sounds = getDefinedSounds(rules);
  const singles = getEncodableEntries(rules).filter((e) => e.symbols && e.sound && e.status === 'defined');
  const singleBySym = new Map(singles.map((e) => [e.symbols, e.sound]));

  const hits = [];
  const seqBySym = new Map();

  for (const seq of sequencesUpToLength(sounds, maxLen)) {
    const symbols = seq.map((k) => map[k]).join('');
    if (!symbols) continue;

    const label = seq.join(' + ');
    if (!seqBySym.has(symbols)) seqBySym.set(symbols, []);
    seqBySym.get(symbols).push(seq);

    const singleKey = singleBySym.get(symbols);
    if (singleKey && !(seq.length === 1 && seq[0] === singleKey)) {
      hits.push({
        sequenceA: label,
        sequenceB: singleKey,
        symbols,
        collisionType: seq.length === 1 ? 'alias' : 'sequence-equals-single',
        exampleWordRisk: concatExampleRisk(seq, singleKey),
        recommendation: classifyConcatRecommendation(seq, singleKey),
      });
    }
  }

  for (const [symbols, seqs] of seqBySym.entries()) {
    for (let len = 2; len <= maxLen; len++) {
      const unique = uniqueSequences(sameLengthSequences(seqs, len));
      if (unique.length < 2) continue;
      hits.push({
        sequenceA: unique[0].join(' + '),
        sequenceB: unique[1].join(' + '),
        symbols,
        collisionType: 'sequence-equals-sequence',
        exampleWordRisk: `${unique[0].join('')} vs ${unique[1].join('')} share symbols`,
        recommendation: 'Language-design decision — distinct phoneme sequences indistinguishable without boundaries',
      });
    }
  }

  return dedupeConcatHits(hits);
}

function concatExampleRisk(seq, singleKey) {
  if (seq.length === 2 && singleKey.length > 1) {
    return `${seq.join('')} may encode as ${singleKey} diphthong/composite`;
  }
  if (seq.length === 2) {
    return `${seq.join('')} shares symbols with phoneme key "${singleKey}"`;
  }
  return `${seq.join(' ')} collapses to ${singleKey}`;
}

function classifyConcatRecommendation(seq, singleKey) {
  const compositeVowels = new Set(['eye', 'ow', 'oy', 'ay']);
  if (compositeVowels.has(singleKey) && seq.length === 2) {
    return 'Known vowel+glide vs diphthong collision — requires symbol boundaries or recipe change (documented in language-rules homograph note)';
  }
  if (seq.length === 2 && seq.every((k) => k.length === 1 || k.length === 2)) {
    return 'Fatal without boundaries — encoder cannot distinguish sequences from greedy decode';
  }
  return 'Human review — may be acceptable merger or requires boundary convention';
}

function dedupeConcatHits(hits) {
  const seen = new Set();
  return hits.filter((h) => {
    const id = `${h.symbols}|${h.sequenceA}|${h.sequenceB}|${h.collisionType}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** @param {object} rules */
export function findGreedyDecoderHazards(rules) {
  const map = buildSoundToSymbolsMap(rules);
  const sounds = getDefinedSounds(rules);
  const hazards = [];

  for (const seq of sequencesUpToLength(sounds, 2)) {
    const symbols = seq.map((k) => map[k]).join('');
    const spaced = seq.map((k) => map[k]).join(' ');
    const expected = seq.join(' ');
    const greedy = decodeSymbols(symbols, rules).pronunciation;
    const greedyKeys = decodeToPhonemeKeys(symbols, rules).phonemeKeys;
    const spacedKeys = decodeToPhonemeKeys(spaced, rules).phonemeKeys;

    if (greedyKeys === expected && spacedKeys === expected) continue;

    hazards.push({
      symbols,
      expectedKeys: expected,
      greedyDecode: greedy,
      greedyKeys,
      spacedKeys,
      spacingFixes: spacedKeys === expected,
      unspacedAmbiguous: greedyKeys !== expected,
      inputDescription: `phoneme keys [${expected}]`,
    });
  }

  const concat = findConcatenationCollisions(rules, 2);
  for (const c of concat) {
    if (c.collisionType !== 'sequence-equals-sequence') continue;
    const symbols = c.symbols;
    const spacedA = c.sequenceA.split(' + ').map((k) => map[k.trim()]).join(' ');
    const keysA = c.sequenceA.split(' + ').join(' ');
    const keysB = c.sequenceB.split(' + ').join(' ');
    hazards.push({
      symbols,
      expectedKeys: `${keysA} OR ${keysB}`,
      greedyDecode: decodeSymbols(symbols, rules).pronunciation,
      greedyKeys: decodeToPhonemeKeys(symbols, rules).phonemeKeys,
      spacedKeys: decodeToPhonemeKeys(spacedA, rules).phonemeKeys,
      spacingFixes: false,
      unspacedAmbiguous: true,
      inputDescription: `sequence collision ${c.sequenceA} vs ${c.sequenceB}`,
    });
  }

  return dedupeHazards(hazards);
}

function dedupeHazards(hazards) {
  const seen = new Set();
  return hazards.filter((h) => {
    if (seen.has(h.symbols)) return false;
    seen.add(h.symbols);
    return true;
  });
}

/**
 * @param {string[]} words
 * @param {object} bundle
 * @param {{ lang?: string, englishDialect?: string }} [options]
 */
export async function runWordRoundTripAudit(words, bundle, options = {}) {
  const lang = options.lang || 'en';
  const pipelineOptions = options.englishDialect ? { englishDialect: options.englishDialect } : {};
  const rows = [];

  for (const word of words) {
    const ipa = await textToIpa(word, lang, pipelineOptions);
    const normalized = normalizeIpa(ipa, {
      vowelMode: bundle.ipaVowelMode,
      vowelMap: bundle.ipaVowelMap,
    });
    const fonora = ipaPhonemesToFonora(normalized.phonemeString, bundle.rules);
    const unspacedSymbols = fonora.symbols.replace(/\s+/g, '');
    const unspacedKeys = decodeToPhonemeKeys(unspacedSymbols, bundle.rules).phonemeKeys;
    const greedy = decodeSymbols(unspacedSymbols, bundle.rules).pronunciation;

    const issues = [];
    if (fonora.decoded !== normalized.display) issues.push('recovered-keys-mismatch');
    if (unspacedKeys !== fonora.decoded) issues.push('boundary-dependent');
    if (greedy.replace(/\s+/g, '') !== fonora.decoded.replace(/\s+/g, '')) issues.push('greedy-concat-misleading');

    rows.push({
      word,
      ipa,
      phonemeKeys: normalized.display,
      symbols: fonora.symbols,
      recoveredKeys: fonora.decoded,
      unspacedRecovered: unspacedKeys,
      greedyConcat: greedy,
      issues,
    });
  }

  return rows;
}

export function analyzeTestSuiteGaps() {
  return {
    v2CollisionGroups: V2_COLLISION_GROUPS.length,
    v2Words: V2_COLLISION_GROUPS.flatMap((g) => g.words).length,
    v2Checks: [
      'Within-group distinct Fonora symbol strings (fonora field)',
      'Does NOT check exact symbol collisions in inventory',
      'Does NOT check phoneme-key concatenation collisions',
      'Does NOT check unspaced greedy decode hazards',
      'Recovered keys now space-separated — no longer English spellings',
    ],
    misleadingClaims: [
      '"0 collision groups" means minimal-pair groups have distinct symbol outputs — not zero symbol-system collisions',
      'Spacing in pipeline output can hide concatenation collisions during round-trip',
    ],
    recommendedReports: [
      'exact symbol collisions',
      'concatenation collisions (sequence vs single, sequence vs sequence)',
      'boundary-dependent round-trip failures',
      'word-level phoneme-key recovery mismatches',
    ],
  };
}

/**
 * @param {{ bundle: object, words?: string[], lang?: string, englishDialect?: string }} options
 */
export async function runFullCollisionAudit(options = {}) {
  const { bundle } = options;
  const rules = bundle.rules;
  const inventory = buildSymbolInventory(rules);
  const exact = findExactCollisions(inventory);
  const concatenation = findConcatenationCollisions(rules);
  const greedy = findGreedyDecoderHazards(rules);
  const testGaps = analyzeTestSuiteGaps();

  const defaultWords = [
    'bar', 'boy', 'bor', 'car', 'core', 'coy', 'far', 'foy', 'for',
    'saw', 'soar', 'soy', 'hat', 'hot', 'hut', 'cat', 'cot', 'cut',
    'bad', 'bod', 'bud', 'bake', 'back', 'book', 'boot', 'eight', 'ate',
    'hello', 'thin', 'this', 'zoo', 'buzz', 'music', 'father', 'palm',
    'tht', 'ts', 'pb',
  ];

  await initEspeak();
  const wordRows = await runWordRoundTripAudit(options.words || defaultWords, bundle, {
    lang: options.lang || 'en',
    englishDialect: options.englishDialect || 'en-us',
  });

  const wordIssues = wordRows.filter((r) => r.issues.length > 0);

  return {
    generatedAt: new Date().toISOString(),
    rulesVersion: rules.config?.fonora_version || 'unknown',
    inventory,
    exact,
    concatenation,
    greedy,
    wordRows,
    wordIssues,
    testGaps,
    summary: buildExecutiveSummary({ exact, concatenation, greedy, wordIssues, testGaps }),
  };
}

function buildExecutiveSummary({ exact, concatenation, greedy, wordIssues, testGaps }) {
  const seqVsSingle = concatenation.filter((c) => c.collisionType === 'sequence-equals-single');
  const seqVsSeq = concatenation.filter((c) => c.collisionType === 'sequence-equals-sequence');
  const boundaryWords = wordIssues.filter((w) => w.issues.includes('boundary-dependent'));

  return {
    exactCollisionCount: exact.length,
    concatenationSingleCount: seqVsSingle.length,
    concatenationSequenceCount: seqVsSeq.length,
    greedyHazardCount: greedy.length,
    wordIssueCount: wordIssues.length,
    boundaryDependentWords: boundaryWords.map((w) => w.word),
    v2TestScope: `${testGaps.v2CollisionGroups} minimal-pair groups / ${testGaps.v2Words} words — symbol distinctness only`,
  };
}

function mdTable(headers, rows) {
  const line = (cells) => `| ${cells.join(' | ')} |`;
  return [line(headers), line(headers.map(() => '---')), ...rows.map((r) => line(r))].join('\n');
}

/** @param {ReturnType<typeof runFullCollisionAudit> extends Promise<infer T> ? T : never} audit */
export function formatCollisionAuditMarkdown(audit) {
  const lines = [];
  lines.push('# Fonora Collision Audit');
  lines.push('');
  lines.push(`Generated: ${audit.generatedAt}`);
  lines.push(`Rules version: ${audit.rulesVersion}`);
  lines.push('');

  lines.push('## Executive summary');
  lines.push('');
  const s = audit.summary;
  lines.push(`- **Exact symbol collisions:** ${s.exactCollisionCount}`);
  lines.push(`- **Concatenation → single-key collisions:** ${s.concatenationSingleCount}`);
  lines.push(`- **Concatenation → sequence collisions:** ${s.concatenationSequenceCount}`);
  lines.push(`- **Greedy decoder hazards:** ${s.greedyHazardCount}`);
  lines.push(`- **Word-level boundary issues:** ${s.wordIssueCount} (${s.boundaryDependentWords.join(', ') || 'none'})`);
  lines.push(`- **v2 collision test scope:** ${s.v2TestScope}`);
  lines.push('');
  lines.push('The bar/boy/bor fix addressed **display labeling** and **boundary-aware round-trip** in the IPA pipeline. It does **not** remove underlying symbol ambiguity where `o + r` and `oy` share symbols, or where `th + t` and `t + s` share symbols.');
  lines.push('');

  lines.push('## 1. Symbol inventory');
  lines.push('');
  lines.push(
    mdTable(
      ['key', 'type', 'IPA', 'symbols', 'source', 'status', 'notes'],
      audit.inventory
        .filter((r) => r.type !== 'ipa mapping')
        .slice(0, 80)
        .map((r) => [
          r.key,
          r.type,
          r.ipa.replace(/\|/g, '\\|'),
          `\`${r.symbols}\``,
          r.source,
          r.status,
          (r.notes || '').slice(0, 40),
        ]),
    ),
  );
  lines.push('');
  lines.push(`_Full inventory: ${audit.inventory.length} rows (including ${audit.inventory.filter((r) => r.type === 'ipa mapping').length} IPA map entries)._`);
  lines.push('');

  lines.push('## 2. Exact symbol collisions');
  lines.push('');
  if (!audit.exact.length) {
    lines.push('No two distinct encodable phoneme keys share the exact same symbol string.');
  } else {
    lines.push(
      mdTable(
        ['symbols', 'keys', 'types', 'severity', 'recommendation'],
        audit.exact.map((c) => [`\`${c.symbols}\``, c.keys.join(', '), c.types.join(', '), c.severity, c.recommendation]),
      ),
    );
  }
  lines.push('');

  lines.push('## 3. Concatenation collisions');
  lines.push('');
  lines.push(
    mdTable(
      ['sequence A', 'sequence B', 'symbols', 'type', 'example risk', 'recommendation'],
      audit.concatenation.map((c) => [
        c.sequenceA,
        c.sequenceB,
        `\`${c.symbols}\``,
        c.collisionType,
        c.exampleWordRisk,
        c.recommendation,
      ]),
    ),
  );
  lines.push('');

  lines.push('## 4. Greedy decoder hazards');
  lines.push('');
  lines.push('`decodeSymbols()` uses longest-match on unsegmented symbol strings. `decodeToPhonemeKeys()` uses space boundaries when present.');
  lines.push('');
  lines.push(
    mdTable(
      ['symbols', 'expected keys', 'greedy keys', 'spaced keys', 'spacing fixes?', 'notes'],
      audit.greedy.map((h) => [
        `\`${h.symbols}\``,
        h.expectedKeys,
        h.greedyKeys,
        h.spacedKeys,
        h.spacingFixes ? 'yes' : 'no',
        h.inputDescription,
      ]),
    ),
  );
  lines.push('');

  lines.push('## 5. Real word round-trip risks');
  lines.push('');
  if (!audit.wordIssues.length) {
    lines.push('No issues in the tested word set.');
  } else {
    lines.push(
      mdTable(
        ['word', 'phoneme keys', 'recovered', 'unspaced recover', 'issues'],
        audit.wordIssues.map((w) => [
          w.word,
          w.phonemeKeys,
          w.recoveredKeys,
          w.unspacedRecovered,
          w.issues.join(', '),
        ]),
      ),
    );
  }
  lines.push('');
  lines.push('### Full word table');
  lines.push('');
  lines.push(
    mdTable(
      ['word', 'IPA', 'phoneme keys', 'symbols', 'recovered keys', 'unspaced', 'issues'],
      audit.wordRows.map((w) => [
        w.word,
        w.ipa.replace(/\|/g, '\\|'),
        w.phonemeKeys,
        `\`${w.symbols}\``,
        w.recoveredKeys,
        w.unspacedRecovered,
        w.issues.join(', ') || '—',
      ]),
    ),
  );
  lines.push('');

  lines.push('## 6. Test suite review');
  lines.push('');
  lines.push('### What `npm run test:minimal-pairs` actually tests');
  lines.push('');
  for (const item of audit.testGaps.v2Checks) lines.push(`- ${item}`);
  lines.push('');
  lines.push('(`npm run test:v2-collisions` is a deprecated alias for the same script.)');
  lines.push('');
  lines.push('### Misleading claims');
  lines.push('');
  for (const item of audit.testGaps.misleadingClaims) lines.push(`- ${item}`);
  lines.push('');
  lines.push('### Recommended separate reports');
  lines.push('');
  for (const item of audit.testGaps.recommendedReports) lines.push(`- ${item}`);
  lines.push('');

  lines.push('## 7. Recommended fix order (no language redesign yet)');
  lines.push('');
  lines.push('1. **Documentation / UI (done partially):** Label recovered output as phoneme keys, not English spellings.');
  lines.push('2. **Boundary convention (done in pipeline):** Space-separated symbol groups in IPA pipeline output; preserve boundaries in normalize.');
  lines.push('3. **Human language-design decisions required:**');
  lines.push('   - `o + r` vs `oy` (also affects `o + y`→`eye`, `o + w`→`ow`, `e + y`→`ay`)');
  lines.push('   - `th + t` vs `t + s`, `dh + t` vs `t + d`, `v + p` vs `p + b` (derived reverse order vs grid)');
  lines.push('4. **Test suite:** Add `npm run audit:collisions` to CI; extend word-risk list; rename v2 collision test.');
  lines.push('5. **Do not yet:** invent new symbols or remove mappings without explicit design approval.');
  lines.push('');

  lines.push('## 8. Issue classification');
  lines.push('');
  lines.push(
    mdTable(
      ['issue', 'class', 'needs human decision?'],
      [
        ['Recovered keys looked like English (boy)', 'code bug / display', 'no — fixed'],
        ['o+r symbol sequence equals oy', 'language-design collision', 'yes'],
        ['Vowel+glide sequences equal diphthongs (eye/ow/oy/ay)', 'language-design collision', 'yes — homograph note exists'],
        ['th+t equals t+s symbol strings', 'language-design collision', 'yes'],
        ['Unspaced greedy decode mis-recovery', 'decoder + boundary issue', 'partially mitigated by spacing'],
        ['v2 test "0 collisions" wording', 'test/documentation bug', 'no — rename/clarify'],
      ],
    ),
  );
  lines.push('');

  return lines.join('\n');
}
