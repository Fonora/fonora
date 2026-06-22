import { initEspeak } from './ipa.js';
import { normalizeIpa } from './ipa-normalize.js';
import { ipaPhonemesToFonora } from './ipa-to-fonora.js';
import { textToIpa } from './ipa.js';
import { encodeFromIpa } from './ipa-encode-helper.js';
import { V2_COLLISION_GROUPS } from './vowel-v2-collision-groups.js';
import { getMultilingualTestEntries } from './encoder-test-sets.js';

async function resolveBundle(options = {}) {
  if (options.v2Bundle) return options.v2Bundle;
  const { loadActiveRulesFixture } = await import('./load-rules-fixture.js');
  return loadActiveRulesFixture();
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
 * Run vowel-plane collision checks on language-rules.md using minimal-pair groups.
 */
export async function runV2CollisionSuite(options = {}) {
  const lang = options.lang || 'en-us';
  const bundle = await resolveBundle(options);
  await initEspeak();

  const rows = [];
  for (const group of V2_COLLISION_GROUPS) {
    for (const word of group.words) {
      const encoded = await encodeWord(word, bundle, lang);
      rows.push({
        word,
        collisionGroup: group.label,
        groupId: group.id,
        ipa: encoded.ipa,
        phonemes: encoded.phonemes,
        fonora: encoded.symbols,
        decoded: encoded.decoded,
      });
    }
  }

  const groupSummaries = V2_COLLISION_GROUPS.map((group) => {
    const groupRows = rows.filter((r) => r.groupId === group.id);
    const stats = groupCollisionStats(groupRows, 'fonora');
    return {
      group: group.label,
      words: group.words,
      uniqueOutputs: stats.unique,
      hasCollision: stats.hasCollision,
    };
  });

  const totalCollisions = groupSummaries.filter((g) => g.hasCollision).length;

  return {
    rows,
    groupSummaries,
    summary: {
      totalGroups: V2_COLLISION_GROUPS.length,
      groupsWithCollision: totalCollisions,
    },
  };
}

export async function runMultilingualRegression(options = {}) {
  const bundle = await resolveBundle(options);
  await initEspeak();
  const entries = getMultilingualTestEntries();
  const results = [];

  for (const entry of entries) {
    const encoded = await encodeWord(entry.word, bundle, entry.lang);
    results.push({
      word: entry.word,
      lang: entry.lang,
      symbols: encoded.symbols,
      hasFallback: encoded.symbols.includes('?'),
    });
  }

  return {
    results,
    fallbacks: results.filter((r) => r.hasFallback).length,
    total: entries.length,
  };
}

export function formatV2CollisionReport(suiteResult) {
  const lines = [];
  lines.push('# Fonora Vowel-Plane Collision Report');
  lines.push('');
  lines.push('Pipeline: eSpeak NG → IPA → markdown-derived normalize → Fonora symbols');
  lines.push('Rules: language-rules.md');
  lines.push('');

  lines.push('## Word Table');
  lines.push('');
  lines.push('| Word | IPA | Phonemes | Fonora | Decoded | Collision Group |');
  lines.push('| ---- | --- | -------- | ------ | ------- | --------------- |');
  for (const row of suiteResult.rows) {
    lines.push(
      `| ${row.word} | ${row.ipa} | ${row.phonemes} | ${row.fonora} | ${row.decoded} | ${row.collisionGroup} |`,
    );
  }
  lines.push('');

  lines.push('## Group Summaries');
  lines.push('');
  for (const g of suiteResult.groupSummaries) {
    lines.push(`### Group: ${g.group}`);
    lines.push(`Unique outputs: ${g.uniqueOutputs} / ${g.words.length}`);
    lines.push(`Collision within group: ${g.hasCollision ? 'yes' : 'no'}`);
    lines.push('');
  }

  const s = suiteResult.summary;
  lines.push('## Totals');
  lines.push('');
  lines.push(`- Groups with collision: ${s.groupsWithCollision} / ${s.totalGroups}`);
  lines.push('');

  return lines.join('\n');
}

export { encodeFromIpa };
