// Legacy Encoder — English spelling → sound approximation (see encoder-rules.md).
const MACRON = { a: 'ā', e: 'ē', i: 'ī', o: 'ō', u: 'ū' };
const MACRON_TO_SHORT = { ā: 'a', ē: 'e', ī: 'i', ō: 'o', ū: 'u' };
const MACRON_VOWELS = new Set(['ā', 'ē', 'ī', 'ō', 'ū']);
const SHORT_VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

function triggersSoftCG(next) {
  return /[eiy]/.test(next);
}

const CONSONANTS = new Set(['b', 'c', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n', 'p', 'q', 'r', 's', 't', 'v', 'w', 'x', 'y', 'z']);

/** Words that should not have final silent e stripped. */
const NO_SILENT_E_STRIP = new Set(['the', 'he', 'me', 'we', 'be']);

/** Words where magic-e does not lengthen the vowel. */
const MAGIC_E_EXCEPTIONS = new Set([
  'have', 'give', 'live', 'love', 'come', 'some', 'done', 'gone', 'once', 'where',
]);

/** Whole-word phonetic overrides (after lowercasing). */
const WORD_PHONETIC_OVERRIDES = {
  one: 'won',
  their: 'dher',
};

/**
 * Longest / most specific pronunciation substitutions first.
 * Long vowels use macron markers, then collapse to short letters.
 */
const PRONUNCIATION_PATTERNS = [
  { pattern: /eigh/g, replace: 'a', note: 'eigh → a' },
  { pattern: /augh/g, replace: 'af', note: 'augh → af' },
  { pattern: /ough/g, replace: 'uf', note: 'ough → uf' },
  { pattern: /igh/g, replace: 'i', note: 'igh → i' },
  { pattern: /ee/g, replace: 'ē', note: 'ee → e' },
  { pattern: /ea/g, replace: 'ē', note: 'ea → e (approximation)' },
  { pattern: /ai/g, replace: 'ā', note: 'ai → a' },
  { pattern: /ay/g, replace: 'ā', note: 'ay → a' },
  { pattern: /ei/g, replace: 'a', note: 'ei → a (approximation)' },
  { pattern: /ae/g, replace: 'a', note: 'ae → a' },
  { pattern: /oa/g, replace: 'ō', note: 'oa → o' },
  { pattern: /ow/g, replace: 'ō', note: 'ow → o' },
  { pattern: /oo/g, replace: 'ū', note: 'oo → u (approximation)' },
  { pattern: /ew/g, replace: 'ū', note: 'ew → u' },
  { pattern: /oe/g, replace: 'ō', note: 'oe → o' },
  { pattern: /ie/g, replace: 'ī', note: 'ie → i' },
];

function isVoicedThWord(wordContext, i) {
  const slice = wordContext.slice(i);
  return /^(the|this|that|these|those|them|then|there|their|they|thus|thy)\b/.test(slice);
}

function isVoicedThAtStart(wordContext) {
  return /^(the|this|that|these|those|them|then|there|their|they|thus|thy)\b/.test(wordContext);
}

function applyEdSuffix(w, actions) {
  if (!w.endsWith('ed') || w.length < 4) return null;
  if (w.endsWith('eed')) return null;
  const stem = w.slice(0, -2);
  if (!stem) return null;

  if (/[td]$/.test(stem)) {
    actions.push('-ed → ed after t/d');
    return { stem, suffix: 'ed' };
  }
  if (/[pkfsxh]$/.test(stem)) {
    actions.push('-ed → t after voiceless consonant');
    return { stem, suffix: 't' };
  }
  if (/all$/.test(stem)) {
    actions.push('-alled → old approximation');
    return { stem: stem.slice(0, -3) + 'ol', suffix: 'd' };
  }
  actions.push('-ed → d');
  return { stem, suffix: 'd' };
}

function applyPatternRules(s, actions) {
  let out = s;
  for (const { pattern, replace, note } of PRONUNCIATION_PATTERNS) {
    if (!pattern.test(out)) continue;
    actions.push(note);
    out = out.replace(pattern, replace);
  }
  return out;
}

function applyMagicE(w, s, actions) {
  let out = s;

  if (!MAGIC_E_EXCEPTIONS.has(w) && /[aiou][bcdfghjklmnpqrstvwxyz]+e$/i.test(out)) {
    out = out.replace(/([aiou])([bcdfghjklmnpqrstvwxyz]+)e$/, (_, v, mid) => {
      if (MACRON[v]) {
        actions.push(`${v}_e → ${MACRON[v]}`);
        return MACRON[v] + mid;
      }
      return v + mid;
    });
  }

  if (!MAGIC_E_EXCEPTIONS.has(w) && /e[bcdfghjklmnpqrstvwxyz]e$/i.test(out)) {
    out = out.replace(/e([bcdfghjklmnpqrstvwxyz])e$/, (_, mid) => {
      actions.push('e_e → e');
      return 'ē' + mid;
    });
  }

  return out;
}

function applySilentFinalE(originalWord, s, actions) {
  if (NO_SILENT_E_STRIP.has(originalWord)) return s;
  if (!s.endsWith('e') || s.length <= 2) return s;
  if (s.endsWith('le') || s.endsWith('re')) return s;

  const prev = s[s.length - 2];
  if ('āēīōū'.includes(prev)) {
    actions.push('silent final e removed');
    return s.slice(0, -1);
  }

  if (MAGIC_E_EXCEPTIONS.has(originalWord) || CONSONANTS.has(prev)) {
    actions.push('silent final e removed');
    return s.slice(0, -1);
  }
  return s;
}

function collapseLongVowels(s, actions) {
  if (!/[āēīōū]/.test(s)) return s;
  actions.push('long vowel collapsed to short vowel representation');
  return s.replace(/[āēīōū]/g, (m) => MACRON_TO_SHORT[m]);
}

function collapseDoubleConsonants(s, actions) {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === s[i + 1] && CONSONANTS.has(ch) && ch !== 's') {
      actions.push(`double ${ch} → single`);
      out += ch;
      i += 2;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

function applyPronunciationNormalization(w, actions) {
  if (WORD_PHONETIC_OVERRIDES[w]) {
    actions.push(`${w}: word exception → ${WORD_PHONETIC_OVERRIDES[w]}`);
    return WORD_PHONETIC_OVERRIDES[w];
  }

  let s = applyPatternRules(w, actions);
  s = applyMagicE(w, s, actions);
  s = applySilentFinalE(w, s, actions);
  s = collapseLongVowels(s, actions);
  s = collapseDoubleConsonants(s, actions);
  return s;
}

function emitConsonantCluster(w, i, actions, wordContext) {
  const rest = w.slice(i);
  const next = w[i + 1] || '';
  const thVoiced = i === 0 ? isVoicedThAtStart(wordContext) : isVoicedThWord(wordContext, i);

  const clusters = [
    { len: 2, match: 'sh', sound: 'sh' },
    { len: 2, match: 'ng', sound: 'ng' },
    { len: 2, match: 'ph', sound: 'f', note: 'ph → f' },
    { len: 2, match: 'ck', sound: 'k', note: 'ck → k' },
    { len: 2, match: 'qu', sound: 'kw', note: 'qu → kw approximation' },
    { len: 2, match: 'wh', sound: 'w', note: 'wh → w' },
    { len: 2, match: 'wr', sound: 'r', note: 'wr → r' },
    { len: 2, match: 'kn', sound: 'n', note: 'kn → n' },
    { len: 2, match: 'gn', sound: 'n', note: 'gn → n' },
    { len: 2, match: 'ch', sound: 'c', note: 'ch → c' },
    {
      len: 2,
      match: 'th',
      sound: null,
      test: () => rest.startsWith('th'),
      resolve: () => (thVoiced ? 'dh' : 'th'),
    },
    {
      len: 2,
      match: 'mb',
      sound: 'm',
      note: 'mb → m',
      test: () => rest.startsWith('mb') && i + 2 === w.length,
    },
  ];

  for (const rule of clusters) {
    const ok = rule.test ? rule.test() : rest.startsWith(rule.match);
    if (!ok) continue;
    const sound = rule.resolve ? rule.resolve() : rule.sound;
    if (rule.note) actions.push(rule.note);
    return { len: rule.len, sound };
  }

  const ch = w[i];

  if (ch === 'z') {
    actions.push('z → s approximation');
    return { len: 1, sound: 's' };
  }

  if (ch === 'c') {
    if (triggersSoftCG(next)) {
      actions.push('c → s before e/i/y');
      return { len: 1, sound: 's' };
    }
    actions.push('c → k (hard c)');
    return { len: 1, sound: 'k' };
  }

  if (ch === 'g') {
    if (triggersSoftCG(next)) {
      actions.push('g → j before e/i/y');
      return { len: 1, sound: 'j' };
    }
    return { len: 1, sound: 'g' };
  }

  if (MACRON_VOWELS.has(ch) || SHORT_VOWELS.has(ch)) {
    return { len: 1, sound: ch };
  }

  if (ch === 'x') return { len: 1, sound: 'x' };
  if (ch === 'v') return { len: 1, sound: 'v' };
  if (ch === 'h') return { len: 1, sound: 'h' };
  if (CONSONANTS.has(ch)) return { len: 1, sound: ch };

  return { len: 1, sound: null };
}

function pronunciationToSounds(pronunciationForm, actions, warnings, wordContext) {
  const out = [];
  let i = 0;

  while (i < pronunciationForm.length) {
    if (pronunciationForm.slice(i, i + 2) === 'gh') {
      actions.push('silent gh removed');
      i += 2;
      continue;
    }

    const step = emitConsonantCluster(pronunciationForm, i, actions, wordContext);
    i += step.len;

    if (step.sound === null) {
      warnings.push(`Skipped letter "${pronunciationForm[i - 1] || ''}"`);
      continue;
    }
    out.push(step.sound);
  }

  return out.join('');
}

/**
 * @returns {{
 *   original: string,
 *   cleaned: string,
 *   pronunciationForm: string,
 *   phonetic: string,
 *   sounds: string,
 *   pronunciationActions: string[],
 *   conversionActions: string[],
 *   actions: string[],
 *   warnings: string[]
 * }}
 */
export function normalizeEnglishWord(word) {
  const original = word;
  const pronunciationActions = [];
  const conversionActions = [];
  const warnings = [];

  const cleaned = word.toLowerCase().replace(/[^a-z']/g, '');
  if (!cleaned) {
    return {
      original,
      cleaned: '',
      pronunciationForm: '',
      phonetic: '',
      sounds: '',
      pronunciationActions,
      conversionActions,
      actions: [],
      warnings: ['No letters to translate.'],
    };
  }

  let edSuffix = null;
  const ed = applyEdSuffix(cleaned, pronunciationActions);
  let stem = cleaned;
  if (ed) {
    edSuffix = ed.suffix;
    stem = ed.stem;
  }

  const pronunciationForm = applyPronunciationNormalization(stem, pronunciationActions);
  const sounds = pronunciationToSounds(pronunciationForm, conversionActions, warnings, cleaned) + (edSuffix || '');

  return {
    original,
    cleaned,
    pronunciationForm,
    phonetic: pronunciationForm,
    sounds,
    pronunciationActions,
    conversionActions,
    actions: [...pronunciationActions, ...conversionActions],
    warnings,
  };
}

export function normalizeEnglishText(text) {
  const words = [];
  const allActions = [];
  const allWarnings = [];

  for (const part of text.trim().split(/(\s+)/)) {
    if (/^\s+$/.test(part)) {
      words.push({ type: 'space', value: part });
      continue;
    }
    const clean = part.replace(/[^a-zA-Z']/g, '');
    if (!clean) {
      allWarnings.push(`Skipped token "${part}"`);
      continue;
    }
    const norm = normalizeEnglishWord(clean);
    words.push({ type: 'word', english: clean, ...norm });
    allActions.push(...norm.actions.map((a) => `${clean}: ${a}`));
    allWarnings.push(...norm.warnings.map((w) => `${clean}: ${w}`));
  }

  return {
    original: text,
    cleaned: words.map((w) => (w.type === 'space' ? w.value : w.cleaned || '')).join(''),
    pronunciationForm: words.map((w) => (w.type === 'space' ? w.value : w.pronunciationForm || '')).join(''),
    phonetic: words.map((w) => (w.type === 'space' ? w.value : w.pronunciationForm || '')).join(''),
    sounds: words.map((w) => (w.type === 'space' ? w.value : w.sounds)).join(''),
    words,
    actions: allActions,
    warnings: allWarnings,
  };
}
