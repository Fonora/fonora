/** Open Problems content, grounded in repo docs (docs/, README, CONTRIBUTING). */

export const GITHUB_ISSUES_URL = 'https://github.com/jamesc137/fonora/issues';
export const GITHUB_NEW_ISSUE_URL = 'https://github.com/jamesc137/fonora/issues/new/choose';

/** @typedef {'open' | 'partial' | 'needs-testing' | 'research-needed'} ProblemStatus */

/** @type {Record<ProblemStatus, string>} */
export const STATUS_LABELS = {
  open: 'Open',
  partial: 'Partially Solved',
  'needs-testing': 'Needs Testing',
  'research-needed': 'Research Needed',
};

export const CONTRIBUTION_TYPES = [
  'propose mapping',
  'submit minimal pairs',
  'test native-speaker pronunciation',
  'improve parser',
  'improve docs',
  'add examples',
  'file GitHub issue',
];

/**
 * @typedef {Object} ProblemCard
 * @property {string} id
 * @property {string} title
 * @property {ProblemStatus} status
 * @property {string} why
 * @property {string[]} languages
 * @property {string[]} skills
 * @property {string[]} contributions
 * @property {{ label: string, href: string }[]} docs
 */

/** @type {ProblemCard[]} */
export const PROBLEM_CATEGORIES = [
  {
    id: 'readability',
    title: 'Readability & human testing',
    status: 'needs-testing',
    why: 'Fonora targets a compact phonetic script, but learner readability and real-user decoding speed are not yet validated at scale. Automated tests check encoding consistency; human studies are still open.',
    languages: ['All languages', 'English (primary test corpus)'],
    skills: ['UX research', 'education', 'linguistics', 'typography'],
    contributions: ['test native-speaker pronunciation', 'submit minimal pairs', 'add examples', 'file GitHub issue'],
    docs: [
      { label: 'README: test commands', href: 'README.md' },
      { label: 'Pronunciation Testing (manual review)', href: 'docs/pronunciation-validation.md' },
    ],
  },
  {
    id: 'collisions',
    title: 'Symbol collisions & decoding ambiguity',
    status: 'partial',
    why: 'Distinct phoneme sequences can share the same symbol string without explicit boundaries. Spacing fixes greedy decode for many cases, but underlying concatenation hazards remain (e.g. o + y ↔ oy, th + t ↔ t + s).',
    languages: ['All languages using the shared inventory'],
    skills: ['linguistics', 'parser engineering', 'symbol design'],
    contributions: ['submit minimal pairs', 'propose mapping', 'improve parser', 'file GitHub issue'],
    docs: [
      { label: 'FONORA_COLLISION_AUDIT.md', href: 'docs/FONORA_COLLISION_AUDIT.md' },
      { label: 'Pronunciation Validation', href: 'docs/pronunciation-validation.md' },
    ],
  },
  {
    id: 'vowel-architecture',
    title: 'Vowel architecture',
    status: 'partial',
    why: 'v3 vowel grammar (⚬X / ⚬XᵔY) simplified the retired v2 system, but several vowel keys still absorb multiple IPA families. English uses an engineering overlay that intentionally collapses contrasts (e.g. STRUT/schwa/NURSE paths).',
    languages: ['English', 'All languages sharing the rules vowel map'],
    skills: ['phonetics', 'lexical sets', 'symbol grammar design'],
    contributions: ['propose mapping', 'submit minimal pairs', 'improve docs', 'file GitHub issue'],
    docs: [
      { label: 'language-rules.md: vowels', href: 'docs/language-rules.md' },
      { label: 'IPA_VOWEL_NORMALIZATION_AUDIT.md', href: 'docs/IPA_VOWEL_NORMALIZATION_AUDIT.md' },
      { label: 'FONORA_VOWEL_DECISION_REPORT.md (historical v2)', href: 'docs/FONORA_VOWEL_DECISION_REPORT.md' },
    ],
  },
  {
    id: 'multilingual-gaps',
    title: 'Multilingual phoneme gaps',
    status: 'open',
    why: 'Most languages share one vowel inventory from language-rules.md. Supplemental consonant mappings are global, not language-scoped. Unmapped IPA (retroflexes, emphatics, uvulars, glottal stops) falls back to ? or default vowel a.',
    languages: ['Spanish', 'French', 'German', 'Arabic', 'Mandarin', 'Japanese', 'and others'],
    skills: ['IPA', 'language-specific phonology', 'pipeline engineering'],
    contributions: ['propose mapping', 'improve parser', 'add examples', 'file GitHub issue'],
    docs: [
      { label: 'multilingual-support.md', href: 'docs/multilingual-support.md' },
      { label: 'ipa-normalize.md', href: 'docs/ipa-normalize.md' },
      { label: 'IPA-PIPELINE-REPORT.md', href: 'docs/IPA-PIPELINE-REPORT.md' },
    ],
  },
  {
    id: 'tone-languages',
    title: 'Tone languages',
    status: 'research-needed',
    why: 'Fonora has no tone notation in its symbol inventory. Tonal distinctions from eSpeak IPA are not encoded, so tone-language lemmas lose pitch information in the written form.',
    languages: ['Mandarin', 'Other tonal languages'],
    skills: ['tonal phonology', 'symbol design', 'typography'],
    contributions: ['propose mapping', 'improve docs', 'file GitHub issue'],
    docs: [
      { label: 'IPA-PIPELINE-REPORT.md: unmapped phonemes', href: 'docs/IPA-PIPELINE-REPORT.md' },
      { label: 'multilingual-support.md: known limitations', href: 'docs/multilingual-support.md' },
    ],
  },
  {
    id: 'arabic',
    title: 'Arabic / Semitic language support',
    status: 'open',
    why: 'Arabic pharyngeals (ħ, ʕ), emphatics, glottal stop (ʔ), and vowel length are poorly covered. Throat fricatives gh/kh exist for ɣ/χ when eSpeak emits them, but eSpeak often transcribes خ as x instead of χ.',
    languages: ['Arabic', 'Related Semitic languages'],
    skills: ['Arabic phonology', 'IPA', 'eSpeak voice testing'],
    contributions: ['propose mapping', 'test native-speaker pronunciation', 'submit minimal pairs', 'file GitHub issue'],
    docs: [
      { label: 'multilingual-support.md: throat fricatives', href: 'docs/multilingual-support.md' },
      { label: 'ipa-normalize.md: supplemental map', href: 'docs/ipa-normalize.md' },
      { label: 'language-rules.md: reserved throat cells', href: 'docs/language-rules.md' },
    ],
  },
  {
    id: 'hindi',
    title: 'Hindi / Indo-Aryan support',
    status: 'research-needed',
    why: 'Hindi is not yet a selectable UI language. Global supplemental mappings collapse several contrasts (e.g. ɾ→t, ɽ→r) that matter for Indo-Aryan dental vs retroflex and aspiration distinctions.',
    languages: ['Hindi', 'Indo-Aryan languages'],
    skills: ['Hindi phonology', 'IPA', 'minimal-pair design'],
    contributions: ['propose mapping', 'submit minimal pairs', 'submit language test set', 'file GitHub issue'],
    docs: [
      { label: 'ipa-normalize.md: supplemental mappings', href: 'docs/ipa-normalize.md' },
      { label: 'multilingual-support.md: adding language behavior', href: 'docs/multilingual-support.md' },
    ],
  },
  {
    id: 'mandarin',
    title: 'Mandarin / tonal language support',
    status: 'partial',
    why: 'Mandarin is in the Translator and Reader, but tones are not represented in Fonora symbols. Chinese samples are split into clauses for rendering; native-script IPA quality from eSpeak varies.',
    languages: ['Mandarin Chinese'],
    skills: ['Mandarin phonology', 'tonal notation', 'CJK pipeline work'],
    contributions: ['propose mapping', 'add examples', 'test native-speaker pronunciation', 'file GitHub issue'],
    docs: [
      { label: 'multilingual-support.md: CJK notes', href: 'docs/multilingual-support.md' },
      { label: 'IPA-PIPELINE-REPORT.md: native script input', href: 'docs/IPA-PIPELINE-REPORT.md' },
    ],
  },
  {
    id: 'european',
    title: 'French / German / European edge cases',
    status: 'open',
    why: 'French nasal vowels, rounded vowels, uvular /ʁ/, and liaison rely on a shared vowel map without French- or German-specific overlays. German Bach /x/ is supported; ich-laut /ç/ maps to sh via supplemental rules.',
    languages: ['French', 'German', 'Other European languages'],
    skills: ['French/German phonology', 'IPA', 'lexical testing'],
    contributions: ['propose mapping', 'submit minimal pairs', 'add examples', 'file GitHub issue'],
    docs: [
      { label: 'multilingual-support.md', href: 'docs/multilingual-support.md' },
      { label: 'language-rules.md: grid (x, kh)', href: 'docs/language-rules.md' },
      { label: 'ipa-normalize.md', href: 'docs/ipa-normalize.md' },
    ],
  },
  {
    id: 'typography',
    title: 'Handwriting & typography',
    status: 'research-needed',
    why: 'Fonora uses composed Unicode symbols (places, modifiers, vowel recipes). Handwriting conventions, stroke order, and dense-symbol readability in print vs screen are not yet documented or user-tested.',
    languages: ['All languages'],
    skills: ['typography', 'UX', 'education', 'accessibility'],
    contributions: ['add examples', 'improve docs', 'test readability with real users', 'file GitHub issue'],
    docs: [
      { label: 'language-rules.md: symbol core', href: 'docs/language-rules.md' },
      { label: 'CONTRIBUTING.md', href: 'CONTRIBUTING.md' },
    ],
  },
  {
    id: 'tts-ipa',
    title: 'Text-to-speech & IPA round-trip accuracy',
    status: 'partial',
    why: 'The pipeline depends on eSpeak NG IPA output (~18 MB WASM, GPL). Pronunciation Validation checks encode/decode round-trip; mismatches and collision-class warnings remain for some words. Japanese lacks a Piper neural voice; Reader falls back to eSpeak.',
    languages: ['All pipeline languages', 'Japanese (no Piper voice)'],
    skills: ['speech tech', 'IPA', 'test engineering'],
    contributions: ['improve parser', 'test native-speaker pronunciation', 'file GitHub issue', 'add examples'],
    docs: [
      { label: 'pronunciation-validation.md', href: 'docs/pronunciation-validation.md' },
      { label: 'espeak-integration.md', href: 'docs/espeak-integration.md' },
      { label: 'IPA-PIPELINE-REPORT.md', href: 'docs/IPA-PIPELINE-REPORT.md' },
    ],
  },
  {
    id: 'documentation',
    title: 'Documentation & examples',
    status: 'partial',
    why: 'Research docs, collision audits, and multilingual notes exist but are spread across docs/. Non-English examples are marked experimental in Samples. Some code↔markdown gaps remain (e.g. supplemental consonant map in code).',
    languages: ['All languages'],
    skills: ['technical writing', 'linguistics', 'example curation'],
    contributions: ['improve docs', 'add examples', 'submit language test set', 'file GitHub issue'],
    docs: [
      { label: 'docs/README.md', href: 'docs/README.md' },
      { label: 'CONTRIBUTING.md', href: 'CONTRIBUTING.md' },
      { label: 'FONORA_CLEANUP_AUDIT.md', href: 'docs/FONORA_CLEANUP_AUDIT.md' },
    ],
  },
];

/**
 * @typedef {Object} LanguageFocus
 * @property {string} id
 * @property {string} name
 * @property {string[]} topics
 * @property {ProblemStatus} status
 * @property {string[]} contributions
 * @property {{ label: string, href: string }[]} docs
 */

/** @type {LanguageFocus[]} */
export const LANGUAGE_FOCUS = [
  {
    id: 'en',
    name: 'English',
    status: 'needs-testing',
    topics: [
      'Dialect variation (en-us, en-gb, en-au, en-sc, …) affects eSpeak IPA',
      'Engineering vowel overlay collapses some contrasts (NURSE/DRESS, STRUT/schwa)',
      'Flap ɾ maps to spelling-like t via supplemental rules',
      'Readability and minimal-pair testing still need human validation',
    ],
    contributions: ['submit minimal pairs', 'test native-speaker pronunciation', 'propose mapping'],
    docs: [
      { label: 'multilingual-support.md: English overlay', href: 'docs/multilingual-support.md' },
      { label: 'IPA_VOWEL_NORMALIZATION_AUDIT.md', href: 'docs/IPA_VOWEL_NORMALIZATION_AUDIT.md' },
    ],
  },
  {
    id: 'es',
    name: 'Spanish',
    status: 'partial',
    topics: [
      'Taps/trills: ɾ and r distinctions depend on eSpeak output and global supplemental map',
      'Dialectal vowel quality shares the rules map (no Spanish-specific overlay)',
      'lang: es vs lang: en fixes perro-class vowel bugs, more dialect work needed',
    ],
    contributions: ['submit minimal pairs', 'test native-speaker pronunciation', 'add examples'],
    docs: [{ label: 'multilingual-support.md', href: 'docs/multilingual-support.md' }],
  },
  {
    id: 'fr',
    name: 'French',
    status: 'open',
    topics: [
      'Nasal vowels and rounded vowels use the shared inventory',
      'Uvular /ʁ/ maps to r via supplemental rules',
      'Liaison and silent-letter behavior follows eSpeak IPA, not orthography',
    ],
    contributions: ['propose mapping', 'submit minimal pairs', 'add examples'],
    docs: [{ label: 'multilingual-support.md', href: 'docs/multilingual-support.md' }],
  },
  {
    id: 'de',
    name: 'German',
    status: 'partial',
    topics: [
      'Bach /x/ encoded via back-tongue friction (⌀∪)',
      'Ich-laut /ç/ maps to sh; ach /x/ vs ich distinction needs review',
      'Front rounded vowels (ü, ö) share global vowel keys',
      'Uvular /ʁ/ → r in supplemental map',
    ],
    contributions: ['propose mapping', 'submit minimal pairs', 'test native-speaker pronunciation'],
    docs: [
      { label: 'language-rules.md', href: 'docs/language-rules.md' },
      { label: 'ipa-normalize.md', href: 'docs/ipa-normalize.md' },
    ],
  },
  {
    id: 'ar',
    name: 'Arabic',
    status: 'open',
    topics: [
      'Pharyngeals ħ, ʕ and glottal ʔ largely unmapped',
      'Emphatics and vowel length not represented',
      'خ may encode as x (⌀∪) when eSpeak emits x instead of χ (⌀⊃)',
      'Native Arabic script input would improve IPA quality',
    ],
    contributions: ['propose mapping', 'test native-speaker pronunciation', 'file GitHub issue'],
    docs: [{ label: 'multilingual-support.md: throat fricatives', href: 'docs/multilingual-support.md' }],
  },
  {
    id: 'zh',
    name: 'Mandarin',
    status: 'open',
    topics: [
      'Tones from IPA are not written in Fonora symbols',
      'Aspiration and retroflex/alveolo-palatal distinctions partially covered by supplemental map',
      'CJK samples split into clauses; IPA quality varies',
    ],
    contributions: ['propose mapping', 'add examples', 'improve docs'],
    docs: [{ label: 'multilingual-support.md: CJK', href: 'docs/multilingual-support.md' }],
  },
  {
    id: 'hi',
    name: 'Hindi',
    status: 'research-needed',
    topics: [
      'Not yet a selectable UI language',
      'Dental vs retroflex and aspiration contrasts need language-scoped mappings',
      'Breathy voiced consonants and schwa deletion not modeled',
    ],
    contributions: ['propose mapping', 'submit language test set', 'submit minimal pairs'],
    docs: [{ label: 'ipa-normalize.md', href: 'docs/ipa-normalize.md' }],
  },
  {
    id: 'ja',
    name: 'Japanese',
    status: 'partial',
    topics: [
      'No Piper neural voice, Reader uses eSpeak IPA fallback',
      'Mora timing and pitch accent not encoded',
      'Long vowels and gemination rely on vowel keys and consonant sequences',
      'Samples disable Japanese audio',
    ],
    contributions: ['add examples', 'test native-speaker pronunciation', 'improve docs'],
    docs: [{ label: 'multilingual-support.md', href: 'docs/multilingual-support.md' }],
  },
];

export const HOW_TO_HELP = [
  {
    title: 'Open a GitHub issue',
    description: 'Describe the language, word set, or symbol problem. Use a template when possible.',
    href: GITHUB_NEW_ISSUE_URL,
    external: true,
  },
  {
    title: 'Submit a language test set',
    description: 'Curate 20–50 words with expected IPA and native-speaker notes for Pronunciation Testing.',
    href: 'docs/multilingual-support.md#adding-language-specific-behavior',
    external: false,
  },
  {
    title: 'Submit minimal pairs',
    description: 'Pairs that should stay distinct in Fonora but currently collide or merge.',
    href: 'docs/FONORA_COLLISION_AUDIT.md',
    external: false,
  },
  {
    title: 'Review mappings as a native speaker',
    description: 'Run the Translator with your language selected and flag wrong encodings.',
    href: '#translator',
    external: false,
    tab: 'translator',
  },
  {
    title: 'Propose symbol grammar changes',
    description: 'Suggest new grid cells, vowel recipes, or reserved-slot uses in language-rules.md.',
    href: 'docs/language-rules.md',
    external: false,
  },
  {
    title: 'Improve documentation',
    description: 'Clarify concepts, add examples, or link research in docs/.',
    href: 'CONTRIBUTING.md',
    external: false,
  },
  {
    title: 'Test readability with real users',
    description: 'Run decode or construct quizzes and share what learners find easy or confusing.',
    href: '#quiz',
    external: false,
    tab: 'quiz',
  },
];
