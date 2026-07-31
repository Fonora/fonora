/**
 * English morphology, delegated to wink-nlp.
 *
 * This is the only place allowed to know how English inflects. Nothing about
 * Fonoran belongs here: the question "what is the dictionary form of this
 * English word" has one right answer that a maintained English model already
 * knows, and every line we write to answer it ourselves is a line that drifts.
 *
 * It replaces a hand-rolled lemmatizer that suffix-stripped its way to
 * non-words. Measured against the 1001-phrase corpus it rewrote 103 of 516
 * words and disagreed with this model on 65 of them, mostly by producing
 * things that are not English: `between` -> `betwe`, `dangerous` -> `dangerou`,
 * `everything` -> `everyt`, `listen` -> `list`. Its `-ing` branch asked whether
 * a stem ended with its own last character, which is always true, so it shaved
 * a letter off every regular participle: `walking` -> `wal`. Thirteen common
 * words including `broken`, `working`, `stronger` and `does` were reported as
 * missing vocabulary purely because of that.
 *
 * The old table also mapped `go` -> `move`, `man` -> `person` and `fight` ->
 * `war`. Those are not morphology, they are English-to-concept decisions, and
 * the concept alias index already carries every one of them. They are not
 * reproduced here; a word's meaning is the lexicon's business.
 *
 * The wink model is loaded once for the process and shared, because loading it
 * is the expensive part.
 */
import winkNLP from 'wink-nlp';
import model from 'wink-eng-lite-web-model';

const nlp = winkNLP(model);
const its = nlp.its;

/** Shared so callers do not pay to load the English model a second time. */
export { nlp, its };

/**
 * Forms the model leaves inflected. Keep this list empty-ish and justified:
 * every entry is a claim that the English model is wrong, and the cost of a
 * wrong claim is a word that silently stops resolving.
 */
const LEMMA_OVERRIDES = new Map([
  // wink returns these unchanged; both are past forms of drink.
  ['drank', 'drink'],
  ['drunk', 'drink'],
]);

/**
 * Closed English word classes the tagger cannot separate for us.
 *
 * The universal POS tagset labels both `is` and `can` as AUX, and the two behave
 * differently here: a be-form links a subject to a description, a modal colours
 * the action. They live here rather than in each consumer because they were
 * defined twice with the same members, which is how such lists start to drift.
 */
export const BE_FORMS = new Set(['am', 'is', 'are', 'was', 'were', 'be', 'been', 'being']);
export const MODAL_WORDS = new Set(['can', 'could', 'must', 'should', 'may', 'might', 'would', 'shall']);

/** Possessive determiners/pronouns, stripped before nominal lookup. */
export const POSSESSIVE_DETERMINERS = new Set([
  'my', 'your', 'his', 'her', 'its', 'our', 'their', 'mine', 'yours',
]);

/** Calendar words that can open a clause as a time adverbial. */
export const LEADING_TIME_WORDS = new Set(['yesterday', 'today', 'tomorrow', 'now', 'tonight']);

/**
 * All bare time adverbs the structure parser routes to the Time slot. Derived
 * from LEADING_TIME_WORDS so the two lists cannot drift: `later`/`soon` fill
 * Time but do not front a clause the way calendar words do.
 */
export const TIME_WORDS = new Set([...LEADING_TIME_WORDS, 'later', 'soon']);

/** Subordinators that relate two clauses in time; their clause fills the Time slot. */
export const TEMPORAL_SUBORDINATORS = new Set(['when', 'while', 'after', 'before', 'until', 'since']);

/**
 * All words that open a subordinate clause. `as` is left out: "as big as" is
 * not a clause. Derived from TEMPORAL_SUBORDINATORS so the two cannot drift.
 */
export const SUBORDINATORS = new Set([
  ...TEMPORAL_SUBORDINATORS, 'because', 'if', 'unless', 'although', 'though', 'whereas',
]);

/**
 * Words that carry no content when mining meaning out of gloss prose.
 *
 * Glosses are written as explanations ("light; what lets you see"), so mining
 * them unfiltered lets an unrelated word claim a pronoun: without this, the
 * token for *light* would claim the reader's "you".
 */
export const GLOSS_STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'from',
  'and', 'or', 'but', 'that', 'this', 'it', 'its', 'them', 'they', 'their',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
  'no', 'not', 'non', 'without',
  'i', 'me', 'my', 'mine', 'we', 'us', 'our', 'ours',
  'you', 'your', 'yours', 'he', 'him', 'his', 'she', 'her', 'hers',
  'entity', 'thing', 'things', 'someone', 'somebody', 'something', 'anyone',
  'spoken', 'speaker', 'lots', 'lot', 'kind', 'sort', 'used', 'refers',
  'lets', 'let', 'makes', 'make', 'having', 'have',
  'who', 'whom', 'whose', 'which', 'what', 'when', 'where', 'how',
]);

const lemmaCache = new Map();

/**
 * Dictionary form of a single English word.
 *
 * Word-level rather than sentence-level, which is what every caller has. The
 * model reads a bare word as its most likely part of speech, so `saw` lemmatises
 * to `see`; that is the same trade the previous implementation made.
 */
export function lemmatizeEnglish(word) {
  const w = String(word ?? '').trim().toLowerCase();
  if (!w) return '';
  const cached = lemmaCache.get(w);
  if (cached !== undefined) return cached;

  const override = LEMMA_OVERRIDES.get(w);
  const lemma = override ?? nlp.readDoc(w).tokens().out(its.lemma)[0] ?? w;
  const out = lemma || w;
  lemmaCache.set(w, out);
  return out;
}

/**
 * The dictionary form when the surface is inflected, and null when the surface
 * already is the dictionary form.
 *
 * Callers read the null as "nothing was interpreted here", which is what
 * separates resolving *water* from resolving *gave* through *give*.
 */
export function inflectedLemma(word) {
  const w = String(word ?? '').trim().toLowerCase();
  if (!w) return null;
  const lemma = lemmatizeEnglish(w);
  return lemma && lemma !== w ? lemma : null;
}

/**
 * Split English text into lowercase word tokens.
 *
 * Possessive clitics are dropped rather than kept: possession is not lexical in
 * Fonoran, so `the man's dog` must resolve on `man`, not on `man's`. The model
 * splits other clitics too (`don't` becomes `do` + `n't`, `they're` becomes
 * `they` + `'re`), which is what the grammar layer already expects, since `n't`
 * is one of the negators it looks for.
 *
 * A trailing full stop is stripped because the model reports abbreviations as
 * single word tokens, and `No.` is the abbreviation for number: without this,
 * the answer "No." tokenises to `no.` and resolves to nothing.
 */
export function tokenizeEnglish(text) {
  const out = [];
  nlp.readDoc(String(text ?? '')).tokens().each(t => {
    if (t.out(its.type) !== 'word') return;
    const value = t.out(its.value).toLowerCase();
    if (value === "'s" || value === '\u2019s') return;
    const cleaned = value.replace(/\.+$/, '').replace(/^['\u2019]+|['\u2019]+$/g, '');
    if (cleaned) out.push(cleaned);
  });
  return out;
}
