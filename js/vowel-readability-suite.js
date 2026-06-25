import { initEspeak } from './ipa.js';
import { runIpaPipeline } from './ipa-pipeline.js';
import { VOWEL_MINIMAL_PAIR_GROUPS } from './vowel-test-sets.js';

function collisionKey(entry, field) {
  return entry[field] ?? '';
}

function buildCollisionGroups(entries, field) {
  const buckets = new Map();
  for (const entry of entries) {
    const key = collisionKey(entry, field);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(entry);
  }
  return [...buckets.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([output, items]) => ({
      output,
      field,
      words: items.map((e) => e.word),
      entries: items,
      frequency: items.length,
    }))
    .sort((a, b) => b.frequency - a.frequency || a.output.localeCompare(b.output));
}

function inferCollisionReason(group, entries) {
  const words = group.words;
  const ipas = entries.map((e) => ({ word: e.word, ipa: e.ipa }));

  if (group.field === 'decoded' || group.field === 'phonemes') {
    const uniqueIpas = new Set(ipas.map((i) => i.ipa));
    if (uniqueIpas.size === 1) {
      return `eSpeak produced identical IPA (${ipas[0].ipa}); normalization cannot distinguish`;
    }

    const vowels = ipas.map(({ word, ipa }) => {
      const match = ipa.match(/[æɑɒɔʌəɚaɪaʊeɪoʊiːuːoːaːeːɑːɔː]+/);
      return { word, vowel: match ? match[0] : '?' };
    });
    const distinctVowels = new Set(vowels.map((v) => v.vowel));
    if (distinctVowels.size > 1) {
      const collapsed = vowels.map((v) => `${v.vowel} (${v.word})`).join(', ');
      return `Distinct IPA vowels collapse to same Fonora output: ${collapsed}`;
    }
  }

  if (group.field === 'symbols') {
    return 'Distinct phoneme strings encode to identical symbol sequence';
  }

  return 'Output collision across test words';
}

function formatWordRow(entry) {
  return {
    word: entry.word,
    ipa: entry.ipa,
    phonemes: entry.phonemes,
    symbols: entry.symbols,
    decoded: entry.decoded,
    groupId: entry.groupId,
    groupLabel: entry.groupLabel,
    source: entry.source,
    hasFallback: entry.hasFallback,
  };
}

/**
 * Run the vowel readability suite through the full IPA pipeline.
 * @param {object} [rules]
 * @param {{ lang?: string }} [options]
 */
export async function runVowelReadabilitySuite(options = {}) {
  let bundle = options.bundle;
  if (!bundle) {
    const { loadActiveRulesFixture } = await import('./load-rules-fixture.js');
    bundle = loadActiveRulesFixture();
  }
  const rules = bundle.rules;
  const lang = options.lang || 'en';
  await initEspeak();

  const entries = [];
  for (const group of VOWEL_MINIMAL_PAIR_GROUPS) {
    for (const word of group.words) {
      const result = await runIpaPipeline(word, rules, {
        lang,
        testMode: 'vowel-readability',
        vowelMode: bundle.ipaVowelMode,
        vowelMap: bundle.ipaVowelMap,
      });
      entries.push({
        word,
        groupId: group.id,
        groupLabel: group.label,
        groupNote: group.note,
        ipa: result.ipa,
        phonemes: result.phonemeString,
        symbols: result.symbols,
        decoded: result.decoded,
        source: result.source,
        hasFallback: result.hasFallback,
        warnings: result.warnings || [],
      });
    }
  }

  const decodedCollisions = buildCollisionGroups(entries, 'decoded');
  const phonemeCollisions = buildCollisionGroups(entries, 'phonemes');
  const symbolCollisions = buildCollisionGroups(entries, 'symbols');

  const withinGroupCollisions = VOWEL_MINIMAL_PAIR_GROUPS.map((group) => {
    const groupEntries = entries.filter((e) => e.groupId === group.id);
    const decoded = buildCollisionGroups(groupEntries, 'decoded');
    return {
      groupId: group.id,
      groupLabel: group.label,
      words: group.words,
      note: group.note,
      decodedCollisions: decoded,
      hasCollision: decoded.length > 0,
    };
  });

  const collisionReport = decodedCollisions.map((group) => ({
    collisionGroup: group.output,
    wordsInvolved: group.words,
    reason: inferCollisionReason(group, group.entries),
    frequency: group.frequency,
    field: 'decoded',
    groupsAffected: [...new Set(group.entries.map((e) => e.groupLabel))],
  }));

  return {
    entries,
    withinGroupCollisions,
    collisionReport,
    phonemeCollisions,
    symbolCollisions,
    summary: {
      totalWords: entries.length,
      totalGroups: VOWEL_MINIMAL_PAIR_GROUPS.length,
      groupsWithDecodedCollision: withinGroupCollisions.filter((g) => g.hasCollision).length,
      globalDecodedCollisionSets: decodedCollisions.length,
      wordsInDecodedCollision: decodedCollisions.reduce((n, c) => n + c.frequency, 0),
    },
  };
}

export function formatVowelReadabilityReport(suiteResult) {
  const lines = [];
  lines.push('# Fonora Vowel Readability Report');
  lines.push('');
  lines.push('Measures whether the current 5-vowel inventory preserves English word distinctions after compression.');
  lines.push('IPA source: eSpeak NG (en-us). No mapping changes applied.');
  lines.push('');

  lines.push('## Word Results');
  lines.push('');
  for (const group of VOWEL_MINIMAL_PAIR_GROUPS) {
    lines.push(`### ${group.label}`);
    lines.push('');
    lines.push(`_${group.note}_`);
    lines.push('');
    lines.push('| Word | IPA | Normalized phonemes | Fonora symbols | Decoded |');
    lines.push('| ---- | --- | ------------------- | -------------- | ------- |');
    for (const entry of suiteResult.entries.filter((e) => e.groupId === group.id)) {
      lines.push(`| ${entry.word} | ${entry.ipa} | ${entry.phonemes} | ${entry.symbols} | ${entry.decoded} |`);
    }
    lines.push('');
  }

  lines.push('## Within-Group Collision Summary');
  lines.push('');
  lines.push('| Group | Words | Collision? | Shared decoded output |');
  lines.push('| ----- | ----- | ---------- | --------------------- |');
  for (const g of suiteResult.withinGroupCollisions) {
    if (!g.hasCollision) {
      lines.push(`| ${g.groupLabel} | ${g.words.join(', ')} | No | - |`);
      continue;
    }
    for (const c of g.decodedCollisions) {
      lines.push(`| ${g.groupLabel} | ${c.words.join(', ')} | **Yes** | \`${c.output}\` |`);
    }
  }
  lines.push('');

  lines.push('## Global Collision Report (decoded form)');
  lines.push('');
  if (!suiteResult.collisionReport.length) {
    lines.push('No decoded-form collisions detected across the test set.');
  } else {
    lines.push('| Collision group | Words involved | Frequency | Reason | Groups affected |');
    lines.push('| --------------- | -------------- | --------- | ------ | --------------- |');
    for (const c of suiteResult.collisionReport) {
      lines.push(`| \`${c.collisionGroup}\` | ${c.wordsInvolved.join(', ')} | ${c.frequency} | ${c.reason} | ${c.groupsAffected.join('; ')} |`);
    }
  }
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  const s = suiteResult.summary;
  lines.push(`- Test words: ${s.totalWords}`);
  lines.push(`- Minimal-pair groups: ${s.totalGroups}`);
  lines.push(`- Groups with within-group decoded collision: ${s.groupsWithDecodedCollision} / ${s.totalGroups}`);
  lines.push(`- Global decoded collision sets: ${s.globalDecodedCollisionSets}`);
  lines.push(`- Words participating in decoded collisions: ${s.wordsInDecodedCollision} / ${s.totalWords}`);
  lines.push('');

  return lines.join('\n');
}
