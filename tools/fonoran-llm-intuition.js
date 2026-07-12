/**
 * v4 Compositional Intuition Battery — Tasks A/B/C (no multiple choice).
 * Produces weights for candidate ranking, not MC gloss matching.
 *
 * v4 changes (RN-30, synthetic-only validity strategy):
 * - Personas are cross-lingual listeners prompted fully in their L1 (es/zh/ar/hi/sw)
 *   with root glosses translated into that language.
 * - Recovery is scored by a separate blind LLM grader (match/partial/no_match)
 *   instead of the loose English substring matcher that saturated cold recovery.
 * - Inference runs on the judge model role (default claude-fable-5), never the
 *   proposer model, so no model scores its own vocabulary proposals.
 */

import { completeJson } from './fonoran-llm-client.js';
import { PUZZLE_FEEDBACK_TAGS } from './fonoran-playtests.js';
import { PROMPT_VERSION, compositionKey } from './fonoran-llm-aggregate.js';
import {
  materializePlaytestTargets,
  allPersonaIds,
} from './fonoran-llm-playtest.js';

export { PROMPT_VERSION, materializePlaytestTargets, allPersonaIds, compositionKey };

export const BATTERY_VERSION = 'cib-v4';
export const DEFAULT_TASKS = ['A', 'B'];

export const CALIBRATION_CONCEPTS = [
  'tool', 'weapon', 'war', 'tribe', 'community',
  'knowledge', 'exchange', 'memory', 'language', 'teacher',
];

/** Small-scale smoke set before full calibration. */
export const PILOT_CONCEPTS = ['tool', 'weapon', 'tribe'];

/**
 * Spot-check set: remediated compounds (compositions changed this sprint)
 * plus high-frequency communicative concepts. Runs in ~460 API calls (~$5-15).
 * Answers: do the clean-onset compositions score as well as the old ones?
 */
export const SPOT_CHECK_CONCEPTS = [
  'mountain', 'rain', 'cloud', 'climb', 'sit', 'stand', 'overhead', 'fall', 'danger',
];

const CONCEPT_SYNONYMS = {
  tool: ['tool', 'useful thing', 'implement', 'instrument', 'useful thing for the hand', 'a tool'],
  weapon: ['weapon', 'tool for conflict', 'arm', 'arms', 'fighting tool'],
  war: ['war', 'warfare', 'battle', 'conflict between tribes', 'fighting between groups'],
  tribe: ['tribe', 'clan', 'people group', 'community with shared identity'],
  community: ['community', 'group of people', 'collective of persons'],
  knowledge: ['knowledge', 'knowing', 'what is known'],
  exchange: ['exchange', 'trade', 'giving and taking'],
  memory: ['memory', 'remembering', 'what is remembered'],
  language: ['language', 'speech', 'shared words'],
  teacher: ['teacher', 'one who teaches', 'person who teaches'],

  // --- vocabulary remediation: new primitives + retired-to-compound + gap concepts ---
  food: ['food', 'something to eat', 'meal', 'nourishment', 'a thing to eat'],
  sick: ['sick', 'ill', 'illness', 'unwell', 'disease', 'not healthy'],
  understand: ['understand', 'understanding', 'comprehend', 'grasp', 'get the meaning'],
  child: ['child', 'kid', 'young person', 'young one', 'offspring', 'small person'],
  wait: ['wait', 'waiting', 'stay', 'pause', 'hold on', 'stay until later'],
  pulse: ['pulse', 'beat', 'beating', 'heartbeat', 'rhythm', 'throb'],
  wave: ['wave', 'moving water', 'ripple', 'swell', 'surge'],
  flow: ['flow', 'flowing', 'current', 'stream', 'water moving'],
  source: ['source', 'origin', 'beginning', 'where it begins', 'start'],
  substance: ['substance', 'material', 'matter', 'what it is made of', 'stuff'],
  form: ['form', 'shape', 'outward shape', 'outline', 'figure'],
  will: ['will', 'intention', 'wanting', 'resolve', 'determination', 'future want'],
  cause: ['cause', 'reason', 'what makes it happen', 'origin of the event'],
  equal: ['equal', 'same amount', 'equality', 'even', 'the same'],
  mark: ['mark', 'sign', 'label', 'symbol', 'name on a thing'],
  reach: ['reach', 'reaching', 'extend', 'stretch to', 'extend the hand'],
  strong: ['strong', 'powerful', 'strength', 'mighty', 'powerful body'],
  part: ['part', 'piece', 'portion', 'a piece of', 'component'],
  change: ['change', 'becoming different', 'transform', 'alter', 'not the same'],
  come: ['come', 'coming', 'move here', 'approach', 'come here'],
  later: ['later', 'after now', 'afterward', 'in a while', 'soon after'],
  own: ['own', 'mine', 'possess', "one's own", 'belong to'],
  safe: ['safe', 'safety', 'secure', 'no danger', 'protected'],
};

/**
 * v4 battery personas: native listeners prompted fully in their L1, with root
 * glosses translated into that language (see fonoran-persona-glossaries.js).
 * They infer meaning in their own language; the blind grader bridges back.
 *
 * Legacy English stance personas (campfire_stranger, literal_root_knower, …)
 * are kept below for the proposal gate and for reproducing v3 rounds.
 */
export const PERSONAS = {
  es_native: {
    id: 'es_native',
    label: 'Spanish native listener',
    lang: 'es',
    strings: {
      system:
        'Eres un hablante nativo de español que está aprendiendo fonorano. Solo conoces las '
        + 'raíces primitivas de la lista; no conoces ninguna palabra compuesta. Piensa y razona '
        + 'en español, sin apoyarte en modismos de otros idiomas.',
      rootsIntro: 'Raíces primitivas que conoces (sin vocabulario compuesto):',
      hears: 'Un hablante dice esta palabra fonorana (NO ves cómo está compuesta):',
      whatMean: '¿Qué crees que quiere decir?',
      expressIntro: 'El hablante quiere expresar:',
      buildsAs: 'La construye así:',
      howNatural: '¿Con qué naturalidad expresa esta construcción ese significado para alguien que solo conoce las raíces?',
      whichEasier: '¿Cuál de las dos expresiones entendería más fácilmente una persona que solo conoce las raíces?',
      answerIn: 'Escribe "inferred_meaning" y "reasoning" en español.',
      lengthGuidance:
        'Prefiere compuestos cortos y fáciles de decir (2–3 raíces). Penaliza cadenas de más de '
        + '3 raíces; usa la etiqueta too_long si la construcción se siente inflada.',
    },
  },
  zh_native: {
    id: 'zh_native',
    label: 'Mandarin native listener',
    lang: 'zh',
    strings: {
      system:
        '你是一位以中文为母语的费诺兰语（Fonoran）学习者。你只认识下面列出的基本词根，'
        + '不认识任何合成词。请用中文思考和推理，不要依赖其他语言的习惯用法。',
      rootsIntro: '你认识的基本词根（没有任何合成词汇）：',
      hears: '有人说出下面这个费诺兰语单词（你看不到它是如何构成的）：',
      whatMean: '你觉得对方想表达什么意思？',
      expressIntro: '说话者想表达：',
      buildsAs: '他这样构造这个词：',
      howNatural: '对一个只认识词根的人来说，这个构造表达该含义有多自然？',
      whichEasier: '对一个只认识词根的人来说，哪个表达更容易理解？',
      answerIn: '"inferred_meaning" 和 "reasoning" 请用中文填写。',
      lengthGuidance:
        '偏好简短、易说的合成词（2–3 个词根）。超过 3 个词根的组合要扣分；'
        + '如果构词显得冗长，请使用 too_long 标签。',
    },
  },
  ar_native: {
    id: 'ar_native',
    label: 'Arabic native listener',
    lang: 'ar',
    strings: {
      system:
        'أنت متحدث أصلي بالعربية تتعلم اللغة الفونورانية. تعرف فقط الجذور الأساسية المذكورة في '
        + 'القائمة، ولا تعرف أي كلمة مركبة. فكّر واستنتج بالعربية، دون الاعتماد على تعابير لغات أخرى.',
      rootsIntro: 'الجذور الأساسية التي تعرفها (بدون أي مفردات مركبة):',
      hears: 'يقول متحدث هذه الكلمة الفونورانية (لا ترى كيف تم تركيبها):',
      whatMean: 'ماذا تظن أنه يقصد؟',
      expressIntro: 'يريد المتحدث التعبير عن:',
      buildsAs: 'ويبنيها هكذا:',
      howNatural: 'ما مدى طبيعية هذا التركيب في التعبير عن هذا المعنى لشخص يعرف الجذور فقط؟',
      whichEasier: 'أي التعبيرين أسهل فهماً لشخص يعرف الجذور فقط؟',
      answerIn: 'اكتب "inferred_meaning" و"reasoning" بالعربية.',
      lengthGuidance:
        'فضّل الكلمات المركبة القصيرة السهلة النطق (جذران إلى ثلاثة). عاقب السلاسل التي تتجاوز '
        + 'ثلاثة جذور؛ استخدم وسم too_long إذا بدا التركيب متضخماً.',
    },
  },
  hi_native: {
    id: 'hi_native',
    label: 'Hindi native listener',
    lang: 'hi',
    strings: {
      system:
        'आप हिंदी के मूल वक्ता हैं और फ़ोनोरान भाषा सीख रहे हैं। आप केवल नीचे दी गई मूल धातुओं को '
        + 'जानते हैं; कोई भी संयुक्त शब्द नहीं जानते। हिंदी में सोचें और तर्क करें, दूसरी भाषाओं के '
        + 'मुहावरों पर निर्भर न रहें।',
      rootsIntro: 'आपको ज्ञात मूल धातुएँ (कोई संयुक्त शब्दावली नहीं):',
      hears: 'कोई वक्ता यह फ़ोनोरान शब्द कहता है (आप नहीं देख सकते कि यह कैसे बना है):',
      whatMean: 'आपको क्या लगता है, वे क्या कहना चाहते हैं?',
      expressIntro: 'वक्ता व्यक्त करना चाहता है:',
      buildsAs: 'वह इसे इस तरह बनाता है:',
      howNatural: 'जो व्यक्ति केवल धातुओं को जानता है, उसके लिए यह रचना उस अर्थ को कितनी सहजता से व्यक्त करती है?',
      whichEasier: 'जो व्यक्ति केवल धातुओं को जानता है, उसके लिए कौन-सी अभिव्यक्ति समझना आसान होगा?',
      answerIn: '"inferred_meaning" और "reasoning" हिंदी में लिखें।',
      lengthGuidance:
        'छोटे, बोलने में आसान संयुक्त शब्दों (2–3 धातु) को प्राथमिकता दें। 3 से अधिक धातुओं वाली '
        + 'शृंखलाओं को दंडित करें; यदि रचना फूली हुई लगे तो too_long टैग का उपयोग करें।',
    },
  },
  sw_native: {
    id: 'sw_native',
    label: 'Swahili native listener',
    lang: 'sw',
    strings: {
      system:
        'Wewe ni mzungumzaji asilia wa Kiswahili unayejifunza lugha ya Fonoran. Unajua tu mizizi '
        + 'ya msingi iliyoorodheshwa hapa chini; hujui neno lolote la mchanganyiko. Fikiri na '
        + 'ufanye hoja kwa Kiswahili, bila kutegemea nahau za lugha nyingine.',
      rootsIntro: 'Mizizi ya msingi unayoijua (bila msamiati wa maneno ya mchanganyiko):',
      hears: 'Mzungumzaji anasema neno hili la Kifonoran (huoni jinsi lilivyoundwa):',
      whatMean: 'Unadhani anamaanisha nini?',
      expressIntro: 'Mzungumzaji anataka kueleza:',
      buildsAs: 'Analiunda hivi:',
      howNatural: 'Kwa mtu anayejua mizizi tu, muundo huu unaeleza maana hiyo kwa kiwango gani cha asili?',
      whichEasier: 'Ni usemi upi ambao mtu anayejua mizizi tu angeuelewa kwa urahisi zaidi?',
      answerIn: 'Andika "inferred_meaning" na "reasoning" kwa Kiswahili.',
      lengthGuidance:
        'Pendelea maneno mafupi yanayosemeka kwa urahisi (mizizi 2–3). Adhibu minyororo ya zaidi '
        + 'ya mizizi 3; tumia lebo too_long ikiwa muundo unaonekana kuwa mrefu kupita kiasi.',
    },
  },

  // --- Legacy English stance personas (v3 battery, proposal gate) ---
  campfire_stranger: {
    id: 'campfire_stranger',
    label: 'Campfire stranger',
    systemExtra:
      'You are a week-one listener. You forgive opaque spellings if the meaning still feels guessable.',
  },
  literal_root_knower: {
    id: 'literal_root_knower',
    label: 'Literal root-knower',
    systemExtra:
      'You derive meaning ONLY from the roots listed. Do not assume English compound names.',
  },
  skeptical_listener: {
    id: 'skeptical_listener',
    label: 'Skeptical listener',
    systemExtra:
      'You penalize vague "thing + X" compounds. Rate vagueness honestly; lazy glosses score high vagueness.',
  },
  cross_lingual: {
    id: 'cross_lingual',
    label: 'Cross-lingual listener',
    systemExtra:
      'You normally think in Spanish. Avoid English-only idioms when inferring meaning.',
  },
};

/** v4 battery persona ids (cross-lingual L1 listeners only). */
export const BATTERY_PERSONA_IDS = ['es_native', 'zh_native', 'ar_native', 'hi_native', 'sw_native'];

export function batteryPersonaIds() {
  return [...BATTERY_PERSONA_IDS];
}

/** Languages needed for persona glossary translation. */
export function batteryLanguages() {
  return BATTERY_PERSONA_IDS
    .map(id => PERSONAS[id]?.lang)
    .filter(Boolean);
}

function normalizeText(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(text) {
  return new Set(normalizeText(text).split(' ').filter(Boolean));
}

function tokenOverlap(a, b) {
  const ta = tokenSet(a);
  const tb = tokenSet(b);
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared / Math.max(ta.size, tb.size);
}

function inConceptSynonyms(guess, conceptId) {
  const g = normalizeText(guess);
  const group = (CONCEPT_SYNONYMS[conceptId] ?? [conceptId.replace(/_/g, ' ')]).map(normalizeText);
  return group.some(s => g === s || g.includes(s) || s.includes(g));
}

/** Strict v3 meaning match — ignores model would_understand unless text matches. */
export function strictMeaningMatch(inferred, targetGloss, conceptId) {
  const g = normalizeText(inferred);
  const t = normalizeText(targetGloss);
  const c = normalizeText(conceptId?.replace(/_/g, ' '));
  if (!g) return false;
  if (g === t || g === c) return true;
  if (tokenOverlap(g, t) >= 0.6 || tokenOverlap(g, c) >= 0.6) return true;
  if (inConceptSynonyms(g, conceptId)) return true;
  return false;
}

function clamp01(n) {
  return Math.max(0, Math.min(1, Number(n) || 0));
}

function personaSystem(persona, task) {
  const p = PERSONAS[persona] ?? PERSONAS.literal_root_knower;

  if (p.lang && p.strings) {
    const lengthGuidance = task === 'B' ? p.strings.lengthGuidance : '';
    return [
      p.strings.system,
      lengthGuidance,
      '',
      // Schema scaffolding stays in English: field names and tag tokens are
      // machine-readable enums, not natural language for the persona.
      `Task ${task}. Respond with JSON only. Use tags from: ${PUZZLE_FEEDBACK_TAGS.join(', ')}.`,
      p.strings.answerIn,
    ].filter(Boolean).join('\n');
  }

  const lengthGuidance = task === 'B'
    ? '\nPrefer short, campfire-sayable compounds (2–3 roots). Penalize chains above 3 flattened roots — tag too_long when a construction feels padded for semantic completeness rather than communicative efficiency.'
    : '';
  return [
    'You evaluate Fonoran compound communicative intuition.',
    p.systemExtra,
    lengthGuidance,
    '',
    `Task ${task}. Respond with JSON only. Use tags from: ${PUZZLE_FEEDBACK_TAGS.join(', ')}.`,
    'Keep reasoning to 1-2 sentences.',
  ].join('\n');
}

function formatPrimitiveGlossary(primitiveGlosses) {
  return (primitiveGlosses ?? [])
    .map(r => `- ${r.id}: "${r.gloss}" (${r.spelling})`)
    .join('\n');
}

function formatCompositionReadable(composition, glossById) {
  return composition.map(id => `${id.replace(/_/g, ' ')} (${glossById.get(id) ?? id})`).join(' + ');
}

export function buildTaskAPrompt({ persona, spelling, primitiveGlosses }) {
  const p = PERSONAS[persona] ?? PERSONAS.literal_root_knower;
  const s = p.strings;
  if (p.lang && s) {
    return {
      system: personaSystem(persona, 'A'),
      user: [
        s.rootsIntro,
        formatPrimitiveGlossary(primitiveGlosses),
        '',
        s.hears,
        spelling,
        '',
        s.whatMean,
        '',
        'JSON: { "inferred_meaning": string, "confidence": 0-1, "would_understand": boolean, "tags": [], "reasoning": string }',
      ].join('\n'),
    };
  }
  return {
    system: personaSystem(persona, 'A'),
    user: [
      `Persona: ${p.label}`,
      '',
      'Primitive roots you know (no compound vocabulary):',
      formatPrimitiveGlossary(primitiveGlosses),
      '',
      'A speaker says this Fonoran word (you do NOT see how it is composed):',
      spelling,
      '',
      'What do you think they mean?',
      '',
      'JSON: { "inferred_meaning": string, "confidence": 0-1, "would_understand": boolean, "tags": [], "reasoning": string }',
    ].join('\n'),
  };
}

export function buildTaskBPrompt({
  persona,
  targetGloss,
  composition,
  compositionReadable,
  primitiveGlosses,
}) {
  const p = PERSONAS[persona] ?? PERSONAS.literal_root_knower;
  const s = p.strings;
  if (p.lang && s) {
    // No English concept ids in L1 prompts — the persona reasons entirely from
    // the localized glosses.
    return {
      system: personaSystem(persona, 'B'),
      user: [
        s.rootsIntro,
        formatPrimitiveGlossary(primitiveGlosses),
        '',
        `${s.expressIntro} "${targetGloss}"`,
        `${s.buildsAs} ${compositionReadable}`,
        '',
        s.howNatural,
        '',
        'JSON: { "inferred_meaning": string, "naturalness": 0-1, "vagueness": 0-1, "would_use_this": boolean, "tags": [], "reasoning": string }',
      ].join('\n'),
    };
  }
  return {
    system: personaSystem(persona, 'B'),
    user: [
      `Persona: ${p.label}`,
      '',
      'Primitive roots you know:',
      formatPrimitiveGlossary(primitiveGlosses),
      '',
      `The speaker wants to express: "${targetGloss}"`,
      `They build it as: ${compositionReadable}`,
      `(composition ids: ${composition.join(' + ')})`,
      '',
      'How naturally does this construction express that meaning?',
      '',
      'JSON: { "inferred_meaning": string, "naturalness": 0-1, "vagueness": 0-1, "would_use_this": boolean, "tags": [], "reasoning": string }',
    ].join('\n'),
  };
}

export function buildTaskCPrompt({
  persona,
  targetGloss,
  candidateA,
  candidateB,
  primitiveGlosses = null,
}) {
  const p = PERSONAS[persona] ?? PERSONAS.literal_root_knower;
  const s = p.strings;
  const fmt = (label, c) => [
    `${label}: "${c.spelling}"`,
    `   ${c.compositionReadable ?? c.composition.join(' + ')}`,
  ].join('\n');

  if (p.lang && s) {
    return {
      system: personaSystem(persona, 'C'),
      user: [
        ...(primitiveGlosses?.length
          ? [s.rootsIntro, formatPrimitiveGlossary(primitiveGlosses), '']
          : []),
        `${s.expressIntro} "${targetGloss}"`,
        '',
        s.whichEasier,
        fmt('A', candidateA),
        fmt('B', candidateB),
        '',
        'JSON: { "preferred": "A" | "B", "margin": 0-1, "reasoning": string }',
      ].join('\n'),
    };
  }
  return {
    system: personaSystem(persona, 'C'),
    user: [
      `Persona: ${p.label}`,
      '',
      ...(primitiveGlosses?.length
        ? ['Primitive roots you know:', formatPrimitiveGlossary(primitiveGlosses), '']
        : []),
      `The speaker wants to express: "${targetGloss}"`,
      '',
      'Which expression would a root-knower understand more easily?',
      fmt('A', candidateA),
      fmt('B', candidateB),
      '',
      'JSON: { "preferred": "A" | "B", "margin": 0-1, "reasoning": string }',
    ].join('\n'),
  };
}

function parseTags(raw) {
  return Array.isArray(raw?.tags)
    ? raw.tags.filter(t => PUZZLE_FEEDBACK_TAGS.includes(t))
    : [];
}

/**
 * Blind meaning grader (cib-v4). A separate judge-model call compares the
 * persona's inferred meaning against the intended target meaning. The grader
 * never sees the composition or the spelling — only the two meanings — so it
 * cannot leak compositional hints back into the recovery score. Handles
 * non-English inferred meanings (L1 personas) by translating before grading.
 *
 * Replaces the v3 English substring/synonym matcher that saturated cold
 * recovery at ~100% on transparent concepts.
 *
 * @returns {Promise<{ ok: boolean, match: 'match'|'partial'|'no_match', score: number, reasoning?: string, grader: string, error?: string }>}
 */
export async function gradeMeaningMatch({ inferred, targetGloss, conceptId } = {}) {
  const inferredText = String(inferred ?? '').trim();
  if (!inferredText) {
    return { ok: true, match: 'no_match', score: 0, grader: 'empty' };
  }

  const result = await completeJson({
    role: 'judge',
    temperature: 0,
    system: [
      'You are a strict blind grader for a constructed-language experiment.',
      "You compare a listener's inferred meaning against the intended target meaning.",
      'The inferred meaning may be written in any language — translate it before grading.',
      'Grade ONLY semantic equivalence. Do not reward vague or generic guesses.',
      '',
      'Rubric:',
      '- "match": the inferred meaning identifies the same core concept (translations and close synonyms count; extra nuance is fine).',
      '- "partial": clearly related or overlapping, but misses the core concept or is far too general (e.g. "a thing people use" for "tool").',
      '- "no_match": a different concept, contradictory, or so vague it could describe many concepts.',
      '',
      'Respond with JSON only: { "match": "match" | "partial" | "no_match", "reasoning": string }',
      'Keep reasoning to one sentence.',
    ].join('\n'),
    user: [
      `Target meaning: "${targetGloss}"`,
      `Listener's inferred meaning: "${inferredText}"`,
    ].join('\n'),
  });

  if (!result.ok) {
    // Grader unavailable — fall back to the deterministic v3 English matcher.
    const matched = strictMeaningMatch(inferredText, targetGloss, conceptId);
    return {
      ok: false,
      error: result.error,
      match: matched ? 'match' : 'no_match',
      score: matched ? 1 : 0,
      grader: 'fallback_strict',
    };
  }

  const match = ['match', 'partial', 'no_match'].includes(result.data?.match)
    ? result.data.match
    : 'no_match';
  return {
    ok: true,
    match,
    score: match === 'match' ? 1 : match === 'partial' ? 0.5 : 0,
    reasoning: String(result.data?.reasoning ?? '').trim(),
    grader: result.model ?? 'llm',
  };
}

export async function runTaskA(opts) {
  const {
    persona,
    conceptId,
    targetGloss,
    spelling,
    primitiveGlosses,
    temperature = 0.2,
    grade = true,
  } = opts;
  const prompt = buildTaskAPrompt({ persona, spelling, primitiveGlosses });
  const result = await completeJson({ system: prompt.system, user: prompt.user, temperature, role: 'judge' });
  if (!result.ok) return { ok: false, error: result.error, task: 'A', persona };

  const inferred = String(result.data?.inferred_meaning ?? '').trim();
  let matchGrade;
  let gradeScore;
  let grader;
  if (grade) {
    const g = await gradeMeaningMatch({ inferred, targetGloss, conceptId });
    matchGrade = g.match;
    gradeScore = g.score;
    grader = g.grader;
  } else {
    const matched = strictMeaningMatch(inferred, targetGloss, conceptId);
    matchGrade = matched ? 'match' : 'no_match';
    gradeScore = matched ? 1 : 0;
    grader = 'strict';
  }
  return {
    ok: true,
    task: 'A',
    persona,
    inferred_meaning: inferred,
    recovered: matchGrade === 'match',
    match_grade: matchGrade,
    grade_score: gradeScore,
    grader,
    confidence: clamp01(result.data?.confidence),
    tags: parseTags(result.data),
    reasoning: String(result.data?.reasoning ?? '').trim(),
    usage: result.usage,
    model: result.model ?? null,
  };
}

export async function runTaskB(opts) {
  const {
    persona,
    conceptId,
    targetGloss,
    targetGlossLocalized = null,
    composition,
    compositionReadable: compositionReadableOpt = null,
    glossById,
    primitiveGlosses,
    temperature = 0.2,
    grade = true,
  } = opts;
  const compositionReadable = compositionReadableOpt
    ?? formatCompositionReadable(composition, glossById);
  const prompt = buildTaskBPrompt({
    persona,
    targetGloss: targetGlossLocalized ?? targetGloss,
    composition,
    compositionReadable,
    primitiveGlosses,
  });
  const result = await completeJson({ system: prompt.system, user: prompt.user, temperature, role: 'judge' });
  if (!result.ok) return { ok: false, error: result.error, task: 'B', persona };

  const inferred = String(result.data?.inferred_meaning ?? '').trim();
  let matchGrade;
  let gradeScore;
  let grader;
  if (grade) {
    // Grade against the canonical English gloss, not the localized one.
    const g = await gradeMeaningMatch({ inferred, targetGloss, conceptId });
    matchGrade = g.match;
    gradeScore = g.score;
    grader = g.grader;
  } else {
    const matched = strictMeaningMatch(inferred, targetGloss, conceptId);
    matchGrade = matched ? 'match' : 'no_match';
    gradeScore = matched ? 1 : 0;
    grader = 'strict';
  }
  return {
    ok: true,
    task: 'B',
    persona,
    inferred_meaning: inferred,
    composition_recovery: matchGrade === 'match',
    match_grade: matchGrade,
    grade_score: gradeScore,
    grader,
    naturalness: clamp01(result.data?.naturalness),
    vagueness: clamp01(result.data?.vagueness),
    tags: parseTags(result.data),
    reasoning: String(result.data?.reasoning ?? '').trim(),
    usage: result.usage,
    model: result.model ?? null,
  };
}

export async function runTaskC(opts) {
  const {
    persona,
    targetGloss,
    targetGlossLocalized = null,
    candidateA,
    candidateB,
    primitiveGlosses = null,
    temperature = 0.2,
  } = opts;
  const prompt = buildTaskCPrompt({
    persona,
    targetGloss: targetGlossLocalized ?? targetGloss,
    candidateA,
    candidateB,
    primitiveGlosses,
  });
  const result = await completeJson({ system: prompt.system, user: prompt.user, temperature, role: 'judge' });
  if (!result.ok) return { ok: false, error: result.error, task: 'C', persona };

  const pref = String(result.data?.preferred ?? '').trim().toUpperCase();
  const preferredKey = pref === 'A' ? compositionKey(candidateA.composition)
    : pref === 'B' ? compositionKey(candidateB.composition) : null;

  return {
    ok: true,
    task: 'C',
    persona,
    preferred: pref === 'A' || pref === 'B' ? pref : null,
    preferred_key: preferredKey,
    margin: clamp01(result.data?.margin),
    pair: [compositionKey(candidateA.composition), compositionKey(candidateB.composition)].sort().join('|vs|'),
    reasoning: String(result.data?.reasoning ?? '').trim(),
    usage: result.usage,
    model: result.model ?? null,
  };
}

export function primitiveGlossary(rootGlosses, primitiveIds) {
  const prim = new Set(primitiveIds ?? []);
  return (rootGlosses ?? []).filter(r => prim.has(r.id));
}

export function allCandidatePairs(targetsForConcept) {
  const pairs = [];
  for (let i = 0; i < targetsForConcept.length; i++) {
    for (let j = i + 1; j < targetsForConcept.length; j++) {
      pairs.push([targetsForConcept[i], targetsForConcept[j]]);
    }
  }
  return pairs;
}

export function intuitionResumeKey({
  conceptId,
  composition,
  persona,
  task,
  pair = null,
  promptVersion = PROMPT_VERSION,
  model = null,
}) {
  const compPart = task === 'C' && pair ? `pair:${pair}` : compositionKey(composition);
  const modelPart = model ? `model:${model}` : '';
  return [conceptId, compPart, persona, task, promptVersion, modelPart].filter(Boolean).join('|');
}

export function makeIntuitionRoundRecord({
  conceptId,
  composition,
  spelling,
  persona,
  task,
  result,
  model,
  pair = null,
  seedBankFingerprint = null,
}) {
  const base = {
    id: `llm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    concept_id: conceptId,
    candidate_composition: composition ?? null,
    shown_spelling: spelling ?? null,
    persona,
    task,
    pair: pair ?? null,
    source: 'llm_intuition',
    prompt_version: PROMPT_VERSION,
    battery: BATTERY_VERSION,
    model,
    seed_bank_fingerprint: seedBankFingerprint,
    tags: result.tags ?? [],
    reasoning: result.reasoning ?? '',
  };

  if (task === 'A') {
    return {
      ...base,
      inferred_meaning: result.inferred_meaning,
      recovered: result.recovered,
      match_grade: result.match_grade ?? null,
      grade_score: result.grade_score ?? null,
      grader: result.grader ?? null,
      confidence: result.confidence,
    };
  }
  if (task === 'B') {
    return {
      ...base,
      inferred_meaning: result.inferred_meaning,
      composition_recovery: result.composition_recovery,
      match_grade: result.match_grade ?? null,
      grade_score: result.grade_score ?? null,
      grader: result.grader ?? null,
      naturalness: result.naturalness,
      vagueness: result.vagueness,
    };
  }
  return {
    ...base,
    preferred: result.preferred,
    preferred_key: result.preferred_key,
    margin: result.margin,
    pair: result.pair,
  };
}
