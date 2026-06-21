import { initEspeak } from './ipa.js';
import { normalizeIpa } from './ipa-normalize.js';
import { ipaPhonemesToFonora } from './ipa-to-fonora.js';
import { textToIpa } from './ipa.js';
import { encodeFromIpa } from './ipa-encode-helper.js';
import { V2_COLLISION_GROUPS } from './vowel-v2-collision-groups.js';
import { getMultilingualTestEntries } from './encoder-test-sets.js';

async function resolveBundles(options = {}) {
  if (options.v1Bundle && options.v2Bundle) {
    return { v1Bundle: options.v1Bundle, v2Bundle: options.v2Bundle };
  }
  const { loadActiveRulesFixture, loadV1RulesFixture } = await import('./load-rules-fixture.js');
  return {
    v1Bundle: options.v1Bundle ?? loadV1RulesFixture(),
    v2Bundle: options.v2Bundle ?? loadActiveRulesFixture(),
  };
}

function uniqueCount(values) {
  return new Set(values.filter(Boolean)).size;
}

function groupCollisionStats(entries, field) {
  const values = entries.map((e) => e[field]);
  const unique = uniqueCount(values);
  return {
    unique,
    total: entries.length,
    hasCollision: unique < entries.length,
  };
}

async function encodeWord(word, bundle, lang = 'en-us') {
  const ipa = await textToIpa(word, lang);
  const normalized = normalizeIpa(ipa, {
    vowelMode: bundle.ipaVowelMode,
    vowelMap: bundle.ipaVowelMap,
  });
  const fonora = ipaPhonemesToFonora(normalized.phonemeString, bundle.rules);
  return {
    word,
    ipa,
    normalizedIpa: normalized.display,
    phonemes: normalized.phonemeString,
    symbols: fonora.symbols,
    decoded: fonora.decoded,
  };
}

/**
 * Run V1 vs V2 collision comparison using markdown fixtures (not hardcoded rules).
 */
export async function runV2CollisionSuite(options = {}) {
  const lang = options.lang || 'en-us';
  const { v1Bundle, v2Bundle } = await resolveBundles(options);
  await initEspeak();

  const rows = [];
  for (const group of V2_COLLISION_GROUPS) {
    for (const word of group.words) {
      const v1 = await encodeWord(word, v1Bundle, lang);
      const v2 = await encodeWord(word, v2Bundle, lang);
      rows.push({
        word,
        collisionGroup: group.label,
        groupId: group.id,
        ipa: v1.ipa,
        phonemesV1: v1.phonemes,
        phonemesV2: v2.phonemes,
        fonoraV1: v1.symbols,
        fonoraV2: v2.symbols,
        decodedV1: v1.decoded,
        decodedV2: v2.decoded,
      });
    }
  }

  const groupSummaries = V2_COLLISION_GROUPS.map((group) => {
    const groupRows = rows.filter((r) => r.groupId === group.id);
    const v1Stats = groupCollisionStats(groupRows, 'fonoraV1');
    const v2Stats = groupCollisionStats(groupRows, 'fonoraV2');
    return {
      group: group.label,
      words: group.words,
      v1Unique: v1Stats.unique,
      v2Unique: v2Stats.unique,
      v1HasCollision: v1Stats.hasCollision,
      v2HasCollision: v2Stats.hasCollision,
      improved: v2Stats.unique > v1Stats.unique,
    };
  });

  const totalV1Collisions = groupSummaries.filter((g) => g.v1HasCollision).length;
  const totalV2Collisions = groupSummaries.filter((g) => g.v2HasCollision).length;

  return {
    rows,
    groupSummaries,
    summary: {
      totalGroups: V2_COLLISION_GROUPS.length,
      groupsWithV1Collision: totalV1Collisions,
      groupsWithV2Collision: totalV2Collisions,
      groupsImproved: groupSummaries.filter((g) => g.improved).length,
      groupsRegressed: groupSummaries.filter((g) => !g.improved && g.v2Unique < g.v1Unique).length,
      collisionReduction: totalV1Collisions - totalV2Collisions,
    },
  };
}

export async function runMultilingualRegression(options = {}) {
  const { v1Bundle, v2Bundle } = await resolveBundles(options);
  await initEspeak();
  const entries = getMultilingualTestEntries();
  const results = [];

  for (const entry of entries) {
    for (const [label, bundle] of [
      ['v1', v1Bundle],
      ['v2', v2Bundle],
    ]) {
      const encoded = await encodeWord(entry.word, bundle, entry.lang);
      results.push({
        word: entry.word,
        lang: entry.lang,
        version: label,
        symbols: encoded.symbols,
        hasFallback: encoded.symbols.includes('?'),
      });
    }
  }

  return {
    results,
    v1Fallbacks: results.filter((r) => r.version === 'v1' && r.hasFallback).length,
    v2Fallbacks: results.filter((r) => r.version === 'v2' && r.hasFallback).length,
    total: entries.length,
  };
}

export function formatV2CollisionReport(suiteResult) {
  const lines = [];
  lines.push('# Fonora V2 Vowel-Plane Collision Report');
  lines.push('');
  lines.push('Pipeline: eSpeak NG → IPA → markdown-derived normalize → Fonora symbols');
  lines.push('V1 rules: fixtures/language-rules-v1.md | V2 rules: language-rules.md');
  lines.push('');

  lines.push('## Comparison Table');
  lines.push('');
  lines.push('| Word | IPA | Phonemes V1 | Phonemes V2 | Fonora V1 | Fonora V2 | Collision Group |');
  lines.push('| ---- | --- | ----------- | ----------- | --------- | --------- | --------------- |');
  for (const row of suiteResult.rows) {
    lines.push(`| ${row.word} | ${row.ipa} | ${row.phonemesV1} | ${row.phonemesV2} | ${row.fonoraV1} | ${row.fonoraV2} | ${row.collisionGroup} |`);
  }
  lines.push('');

  lines.push('## Group Summaries');
  lines.push('');
  for (const g of suiteResult.groupSummaries) {
    lines.push(`### Group: ${g.group}`);
    lines.push(`V1 unique outputs: ${g.v1Unique}`);
    lines.push(`V2 unique outputs: ${g.v2Unique}`);
    lines.push(`Improvement: ${g.improved ? 'yes' : 'no'}`);
    lines.push('');
  }

  const s = suiteResult.summary;
  lines.push('## Totals');
  lines.push('');
  lines.push(`- Groups with V1 collision: ${s.groupsWithV1Collision} / ${s.totalGroups}`);
  lines.push(`- Groups with V2 collision: ${s.groupsWithV2Collision} / ${s.totalGroups}`);
  lines.push(`- Net collision reduction: ${s.collisionReduction}`);
  lines.push('');

  return lines.join('\n');
}

export { encodeFromIpa };
