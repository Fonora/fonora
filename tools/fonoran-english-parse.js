/**
 * English structure from word class, not word position.
 *
 * This module answers one question: which English words fill Actor, Action, Target,
 * Place and Time. It knows nothing about Fonoran. Mapping a word to a concept id and
 * rendering particles belong to the translator, because those are the language and this
 * is not: a POS tagger can say "walk is the verb here", and only the lexicon can say
 * what walk is called.
 *
 * It replaces a cascade of hand-written English patterns whose fallback assigned slots
 * by position, so "the tall man walks" made tall the Actor and man the Action. Word
 * class is what English actually marks, so an adjective can no longer shift every role.
 */
import { nlp, its, BE_FORMS, MODAL_WORDS } from './fonoran-english-morphology.js';

/** Prepositions that open a Place phrase. Time words are handled separately. */
const PLACE_PREPS = new Set([
  'in', 'on', 'at', 'into', 'onto', 'inside', 'outside', 'near', 'behind', 'beside',
  'between', 'among', 'through', 'across', 'over', 'under', 'around', 'beyond',
  'toward', 'towards', 'from', 'to', 'up', 'down', 'above', 'below', 'beneath',
  'against', 'along', 'off', 'past', 'opposite',
]);

const TIME_WORDS = new Set(['yesterday', 'today', 'tomorrow', 'now', 'tonight', 'later', 'soon']);
const PAST_AUX = new Set(['did', 'was', 'were', 'had']);
const FUTURE_AUX = new Set(['will', 'shall']);
const NEGATORS = new Set(['not', "n't", 'never', 'no', 'nobody', 'nothing', 'none']);
const WH_WORDS = ['why', 'how', 'where', 'when', 'who', 'what', 'which'];

/** Words that open a subordinate clause. `as` is left out: "as big as" is not a clause. */
const SUBORDINATORS = new Set([
  'when', 'while', 'after', 'before', 'because', 'since', 'if', 'unless', 'until',
  'although', 'though', 'whereas',
]);
const NOMINAL = new Set(['NOUN', 'PROPN', 'PRON']);

/**
 * Demonstratives are arguments, whatever the tagger calls them: it labels the "that" of
 * "say that again" a subordinator, and a scan that stops at every subordinator threw away
 * the rest of the clause.
 */
const DEMONSTRATIVES = new Set(['this', 'that', 'these', 'those']);

/**
 * Fonoran does not mark number, and only the singular forms have roots, so a plural
 * demonstrative is reported as the same word: "those trees" gapped on those alone.
 */
const DEMONSTRATIVE_HEAD = new Map([['these', 'this'], ['those', 'that']]);

/** Relations in time. These have roots, so dropping them loses when something happened. */
const TEMPORAL_PREPS = new Set(['after', 'before', 'during', 'until', 'since']);

/**
 * Determiners that say how much. These are content, not grammar: "some water" and "both
 * strangers" lost the quantity when every determiner was skipped.
 */
const QUANTIFIERS = new Set([
  'some', 'all', 'many', 'much', 'few', 'several', 'every', 'each', 'both', 'any', 'most',
]);

/**
 * Adverbs that grade or connect rather than describe. Fonoran has no roots for these, so
 * they are dropped, while a manner adverb like "fast" is content and has to survive.
 */
/**
 * Adverbs that name a direction rather than a landmark. "away" is a spatial relation, the
 * same slot "into" fills, so it is reported as a relation with nothing to relate to.
 */
const DIRECTION_ADVERBS = new Set(['away', 'back', 'forward', 'onward', 'apart']);

/**
 * English packs the quantity question into "how many" / "how much". Those are not degree
 * probes: they name the count dimension (unknown + count). Scalar adjectives after how
 * ("how far", "how big") are the degree case and stay separate.
 */
const QUANTITY_WH = new Set(['many', 'much']);

const FUNCTION_ADVERBS = new Set([
  'very', 'so', 'quite', 'rather', 'really', 'just', 'only', 'even', 'always', 'never',
  'not', 'then', 'as', 'more', 'most',
]);

/**
 * A possessor is carried by a particle, and the words are read straight off the clause, so
 * repeating them here renders the possessor twice: "my hands" came out as hands, [my], mine.
 */
const POSSESSIVES = new Set(['my', 'mine', 'your', 'yours', 'our', 'ours']);

/**
 * Split a sentence into clauses, each of which is one predication.
 *
 * Fonoran has no subordination and no relative clauses (rulebook, "What the language
 * cannot do yet"), so a two-clause English sentence becomes two statements in sequence.
 * Splitting is also what makes negation scope correct: Rule 10 says a `no` in one clause
 * does not reach into the other, and "machines act and do not learn" parsed as a single
 * clause negates the acting too. The Actor is deliberately not carried into the second
 * clause, because Rule 8 drops it when context already supplies it.
 *
 * A segment with no verb of its own is not a clause. "Long ago," is a fragment, so it
 * folds into the clause that follows it rather than becoming an empty predication.
 *
 * The connector is returned rather than discarded. Fonoran has no root for "when", and
 * silently dropping it loses the temporal link between the two statements, so the caller
 * surfaces it as an honest gap instead of pretending the sentence never had one.
 *
 * @param {string} text
 * @returns {{ text: string, connector: string|null }[]}
 */
export function splitClauses(text) {
  const doc = nlp.readDoc(String(text ?? ''));
  /** @type {{ value: string, pos: string }[]} */
  const toks = [];
  doc.tokens().each(t => toks.push({ value: t.out(its.value), pos: t.out(its.pos) }));

  const predicative = t => t.pos === 'VERB' || t.pos === 'AUX';
  /** @type {{ index: number, connector: string|null }[]} */
  const bounds = [];
  for (const [i, t] of toks.entries()) {
    const word = t.value.toLowerCase();
    // The tagger calls a subordinating "when" an adverb, not a subordinator, so the word
    // list is needed as well as the tag. Requiring a predication on both sides is what
    // keeps "after dark" (a bare landmark) from being read as a clause boundary, and what
    // keeps a leading interrogative "When will you go?" in one piece.
    const subordinator = t.pos === 'SCONJ' || SUBORDINATORS.has(word);
    // A leading subordinator has nothing before it, so for "When she arrives, we will
    // leave" the boundary is the comma. Gated the same way, a list comma ("food, water and
    // fire") has no predication after it and is left alone.
    if (subordinator || t.pos === 'CCONJ' || word === ',') {
      // Only a connector joining two predications is a clause boundary. "food or water"
      // coordinates inside one clause and must stay there for Rule 13 to close the group.
      const before = toks.slice(0, i).some(predicative);
      const after = toks.slice(i + 1).some(predicative);
      if (before && after) bounds.push({ index: i, connector: subordinator ? word : null });
    }
  }
  const whole = [{ text: text.trim(), connector: null }];
  if (!bounds.length) return text.trim() ? whole : [];

  /** @type {{ words: string[], hasVerb: boolean, connector: string|null }[]} */
  const segments = [];
  let start = 0;
  let pendingConnector = null;
  for (const bound of [...bounds, { index: toks.length, connector: null }]) {
    const slice = toks.slice(start, bound.index).filter(t => t.pos !== 'PUNCT');
    if (slice.length) {
      let connector = pendingConnector;
      // A leading subordinator is not a boundary, since nothing precedes it to split from,
      // so "When she arrives" carries its own connector into the clause it introduces.
      if (!connector && SUBORDINATORS.has(slice[0].value.toLowerCase())) {
        connector = slice.shift().value.toLowerCase();
      }
      segments.push({ words: slice.map(t => t.value), hasVerb: slice.some(predicative), connector });
    }
    pendingConnector = bound.connector;
    start = bound.index + 1;
  }

  /** @type {{ text: string, connector: string|null }[]} */
  const clauses = [];
  let carry = [];
  for (const segment of segments) {
    const words = [...carry, ...segment.words];
    if (segment.hasVerb) {
      clauses.push({ text: words.join(' '), connector: segment.connector });
      carry = [];
    } else {
      carry = words;
    }
  }
  if (carry.length) {
    if (clauses.length) clauses[clauses.length - 1].text += ` ${carry.join(' ')}`;
    else clauses.push({ text: carry.join(' '), connector: null });
  }
  return clauses.length ? clauses : whole;
}

/**
 * @typedef {object} EnglishParse
 * @property {string|null} actor
 * @property {string|null} action
 * @property {string|null} target
 * @property {{ prep: string, head: string }|null} place first Place, for convenience
 * @property {{ prep: string, head: string }[]} places every Place phrase found
 * @property {string|null} time a scene word, or the tense when there is no scene word
 * @property {string|null} wh
 * @property {string|null} whDegree the scale word in a degree question ("how far" gives
 *   far). Quantity questions ("how many", "how much") are not degree: they set `wh` to the
 *   two-word form and leave this null, so the translator can expand them as unknown+count
 * @property {boolean} negated
 * @property {'past'|'present'|'future'} tense
 * @property {boolean} copula predicate is a quality, not an event
 * @property {{ conj: string, word: string, slot: string }[]} coordinated
 * @property {string[]} modifiers qualities and further arguments, in reading order
 * @property {string|null} actionSurface the Action as written, kept so "ate" is still
 *   reported to the reader while the lexicon is searched for "eat"
 * @property {string|null} targetSurface the Target as written
 * @property {string|null} modal the modal as written, whose sense the caller decides:
 *   "you can come closer" lost its ability marker while the modal went unreported
 */

/**
 * @param {string} text one clause
 * @param {object} [options]
 * @param {Set<string>} [options.predicates] words the caller already knows are the
 *   predicate. A curated idiom such as "at war" is one word to the lexicon and is handed
 *   over masked, so the tagger sees a name and would otherwise read it as an argument.
 * @returns {EnglishParse}
 */
export function parseEnglishStructure(text, { predicates = null } = {}) {
  const doc = nlp.readDoc(String(text ?? ''));
  /** @type {{ value: string, lemma: string, pos: string }[]} */
  const toks = [];
  doc.tokens().each((t) => {
    const pos = t.out(its.pos);
    if (pos === 'PUNCT' || pos === 'SPACE') return;
    toks.push({ value: t.out(its.value).toLowerCase(), lemma: t.out(its.lemma).toLowerCase(), pos });
  });

  /** @type {EnglishParse} */
  const out = {
    actor: null, action: null, target: null, place: null, places: [], time: null,
    wh: null, whDegree: null, negated: false, tense: 'present', copula: false, coordinated: [],
    modifiers: [], actionSurface: null, targetSurface: null, modal: null,
  };
  const nominal = t => NOMINAL.has(t.pos);
  const nominalish = t => Boolean(t) && (NOMINAL.has(t.pos) || t.pos === 'ADJ');
  // What can fill an argument slot. A demonstrative and a number are both content.
  const argument = t => nominal(t) || DEMONSTRATIVES.has(t.value) || t.pos === 'NUM';
  // A possessor is carried by a particle, so it can never be the head of a phrase: "are you
  // my friend" made my the predicate and reported it as a gap next to its own particle.
  const head = t => nominal(t) && !POSSESSIVES.has(t.value);
  const word = t => DEMONSTRATIVE_HEAD.get(t.value) ?? t.lemma;

  const whIndex = toks.findIndex(t => (t.pos === 'ADV' || t.pos === 'PRON' || t.pos === 'DET')
    && WH_WORDS.includes(t.lemma));
  if (whIndex >= 0) out.wh = toks[whIndex].lemma;
  // "how many" / "how much" are one interrogative (unknown + count), not how plus a value.
  // "how far" / "how big" still name a scale position and are reported as whDegree.
  // The quantity word's index is skipped in later scans so it does not also land as a modifier.
  let quantityWhAt = -1;
  if (out.wh === 'how') {
    const next = toks[whIndex + 1];
    if (next && QUANTITY_WH.has(next.lemma)) {
      out.wh = `how ${next.lemma}`;
      quantityWhAt = whIndex + 1;
    } else if (next && (next.pos === 'ADJ' || next.pos === 'ADV')) {
      out.whDegree = next.lemma;
    }
  }

  // "no sentience", "nobody went" and "never been" all negate the clause. Mapping
  // nobody onto person is concept work, so the parse reports the word and the negation.
  out.negated = toks.some(t => NEGATORS.has(t.value) || NEGATORS.has(t.lemma));

  // Coordination is read first so the later scans can skip these tokens by index. An
  // alternative that is also picked up as a Target or a modifier renders twice: "food or
  // water" came out as `lo ye lu ye`, food water one water.
  /** @type {Set<number>} */
  const coordinated = new Set();
  for (let i = 1; i < toks.length - 1; i += 1) {
    if (toks[i].pos !== 'CCONJ') continue;
    const conj = toks[i].lemma;
    const at = toks.findIndex((t, j) => j > i && (t.pos === 'VERB' || t.pos === 'ADJ' || NOMINAL.has(t.pos)));
    if (at < 0) continue;
    const right = toks[at];
    const slot = right.pos === 'VERB' ? 'action' : (right.pos === 'ADJ' ? 'predicate' : 'target');
    out.coordinated.push({ conj, word: right.pos === 'ADJ' ? right.value : right.lemma, slot });
    coordinated.add(at);
  }

  out.modal = toks.find(t => MODAL_WORDS.has(t.value))?.value ?? null;

  const beAt = toks.findIndex(t => t.pos === 'AUX' && BE_FORMS.has(t.value));

  // A past participle right after a copula is a predicate adjective, not an event: "are
  // you tired" describes a state. Left as a VERB it becomes the action `tire` and drags a
  // false past tense in with it. It has to be adjacent to that copula, with at most an
  // inverted subject between: a subordinate "when the world was young" puts a be-form in
  // the sentence, and without the distance check the main verb of "the animal walked on
  // the earth" reads as a participle.
  let participialAt = -1;
  if (beAt >= 0) {
    participialAt = toks.findIndex((t, i) => {
      if (i <= beAt || i - beAt > 3) return false;
      // Any non-progressive verb next to a copula is a participle, not a past event: "are
      // born" and "are created" are present, and keying off an -ed or -en ending alone
      // missed the irregulars and turned "are born" into a past tense.
      if (t.pos !== 'VERB' || /ing$/.test(t.value)) return false;
      if (toks.slice(beAt + 1, i).some(x => x.pos === 'VERB')) return false;
      const after = toks.slice(i + 1);
      const nextContent = after.find(x => x.pos !== 'CCONJ' && x.pos !== 'DET' && x.pos !== 'ADV');
      return !nextContent || nextContent.pos === 'ADJ' || nextContent.pos === 'ADP';
    });
  }

  // A run of nouns is not a sentence, so when the tagger finds no predicate at all the
  // clause is re-read. "Light travels fast" tags as a noun compound, the same reading as
  // "light rays", and an inflected second nominal is the evidence that separates the two:
  // travels and flows are marked, while "time traveler" and "the morning star" are not and
  // stay verbless, as Fonoran needs them to.
  let recoveredVerbAt = -1;
  if (!toks.some(t => t.pos === 'VERB' || t.pos === 'AUX') && toks.filter(nominal).length > 1) {
    recoveredVerbAt = toks.findIndex((t, i) => i > 0 && nominal(t) && t.value !== t.lemma
      && !coordinated.has(i));
  }

  // Where the Actor was found, so the sweep for leftover content can skip it. Without it
  // an inverted "Are you alone?" reports you as the Actor and again as a modifier.
  let actorAt = -1;
  let verbAt = -1;
  const declaredAt = predicates?.size
    ? toks.findIndex(t => predicates.has(t.value))
    : -1;
  if (declaredAt >= 0) {
    out.action = toks[declaredAt].value;
    out.actionSurface = toks[declaredAt].value;
    out.copula = beAt >= 0;
    verbAt = declaredAt;
  } else if (recoveredVerbAt >= 0) {
    out.action = toks[recoveredVerbAt].lemma;
    out.actionSurface = toks[recoveredVerbAt].value;
    verbAt = recoveredVerbAt;
  } else if (participialAt >= 0) {
    out.action = toks[participialAt].value;
    out.actionSurface = toks[participialAt].value;
    out.copula = true;
    verbAt = participialAt;
  } else {
    verbAt = toks.findIndex(t => t.pos === 'VERB');
    if (verbAt >= 0) {
      out.action = toks[verbAt].lemma;
      out.actionSurface = toks[verbAt].value;
    } else {
      const auxAt = toks.findIndex(t => t.pos === 'AUX');
      if (auxAt >= 0) {
        out.copula = true;
        const after = toks.slice(auxAt + 1);
        // Only a question inverts. "Is the baby a girl" puts its subject after the
        // auxiliary, but "the cat is behind the tree" puts it before, and reading the
        // statement as inverted made tree the Actor and dropped the cat and the relation.
        const inverted = !toks.slice(0, auxAt).some(nominal);
        // Only a predicative adjective is the predicate. An attributive one sits in front of
        // its noun, and taking the first adjective anywhere made "powerful" the predicate of
        // "our tribe is at war with a powerful mountain king".
        const adj = after.find((t, k) => t.pos === 'ADJ' && !nominalish(after[k + 1]));
        const here = after.find(t => t.pos === 'ADV' && (t.lemma === 'here' || t.lemma === 'there'));
        if (adj) {
          out.action = adj.lemma;
          out.actionSurface = adj.value;
          verbAt = toks.indexOf(adj);
        } else if (here && inverted) {
          // A locative predicate has no Action in Fonoran: the Place carries it. No
          // relation word: "here" already names the place, and inventing an "at" for it
          // only manufactures a gap for a preposition Fonoran has no root for.
          out.place = { prep: null, head: here.lemma };
          out.places.push(out.place);
          const subj = after.find(head);
          if (subj) { out.actor = subj.lemma; actorAt = toks.indexOf(subj); }
          verbAt = toks.indexOf(here);
        } else if (!inverted) {
          // The predicate follows the copula and the Actor precedes it, which is what the
          // ordinary scans already do, so the copula itself is the pivot.
          verbAt = auxAt;
        } else {
          const subjIdx = after.findIndex(head);
          const comp = subjIdx >= 0 ? after.slice(subjIdx + 1).find(head) : after.find(head);
          if (subjIdx >= 0) {
            out.actor = after[subjIdx].lemma;
            actorAt = toks.indexOf(after[subjIdx]);
          }
          if (comp) {
            out.action = comp.lemma;
            out.actionSurface = comp.value;
            verbAt = toks.indexOf(comp);
          }
        }
      }
    }
  }

  // "be going to VERB" is a tense marker, not locomotion. Without this, "I am going to
  // tell you a story" makes going the Action and loses tell.
  if (out.action === 'go' && toks[verbAt + 1]?.lemma === 'to') {
    const next = toks.slice(verbAt + 2).find(t => t.pos === 'VERB');
    if (next) {
      out.action = next.lemma;
      out.actionSurface = next.value;
      out.tense = 'future';
      verbAt = toks.indexOf(next);
    }
  }

  // A verb whose surface differs from its lemma is past unless the difference is the
  // present -s or a participle in -ing, which covers the irregulars too: `ate`, `went` and
  // `flew` never end in -ed, so keying off that suffix alone lost the past tense entirely.
  for (const [i, t] of toks.entries()) {
    if (i === participialAt) continue;
    if (FUTURE_AUX.has(t.value)) out.tense = 'future';
    else if (PAST_AUX.has(t.value)) out.tense = 'past';
    else if (t.pos === 'VERB' && t.value !== t.lemma && !/(s|ing)$/.test(t.value)) out.tense = 'past';
  }
  if (verbAt < 0) verbAt = toks.length;

  // Actor: head of the noun phrase before the predicate. Last nominal wins, so a
  // stacked modifier ("the tall man") cannot displace the head the way position does.
  for (let i = verbAt - 1; i >= 0 && !out.actor; i -= 1) {
    if (i === whIndex || i === quantityWhAt) continue;
    if (head(toks[i])) { out.actor = toks[i].lemma; actorAt = i; }
  }

  /**
   * An adverb that names a direction is a relation, one that describes is content, and only
   * a grader or a connective is dropped. "alone", "fast" and "please" all have roots, and
   * discarding every adverb lost them.
   * @param {{ value: string, lemma: string, pos: string }} t
   */
  const takeAdverb = (t) => {
    if (DIRECTION_ADVERBS.has(t.lemma)) {
      const place = { prep: t.lemma, head: null };
      out.places.push(place);
      out.place ??= place;
      return;
    }
    if (FUNCTION_ADVERBS.has(t.lemma) || NEGATORS.has(t.lemma) || t.lemma === out.wh) return;
    out.modifiers.push(t.lemma);
  };

  /**
   * Record a relation whose noun never arrived, and forget it. The next token used to
   * clear it outright, so "sit down now" lost its direction and "before we go" its when.
   * @param {string|null} prep
   * @returns {null}
   */
  const flushPrep = (prep) => {
    if (!prep) return null;
    if (TEMPORAL_PREPS.has(prep)) out.modifiers.push(prep);
    else if (PLACE_PREPS.has(prep)) {
      const place = { prep, head: null };
      out.places.push(place);
      out.place ??= place;
    }
    return null;
  };

  // One pass right of the predicate. The governing preposition is remembered rather than
  // read off the immediately preceding token, because a determiner or adjective sits
  // between them: in "into the forest" the token before forest is "the", not "into".
  let pendingPrep = null;
  for (let i = verbAt + 1; i < toks.length; i += 1) {
    const t = toks[i];
    if (coordinated.has(i)) continue;
    if (POSSESSIVES.has(t.value)) continue;
    if (t.pos === 'ADP') { flushPrep(pendingPrep); pendingPrep = t.lemma; continue; }
    // Only a real subordinator starts a separate predication.
    if (t.pos === 'SCONJ' && SUBORDINATORS.has(t.value)) break;
    if (TIME_WORDS.has(t.lemma)) { out.time ??= t.lemma; pendingPrep = flushPrep(pendingPrep); continue; }
    // "here" and "there" are Places even though the tagger calls them adverbs.
    if (t.pos === 'ADV' && (t.lemma === 'here' || t.lemma === 'there')) {
      const place = { prep: pendingPrep && PLACE_PREPS.has(pendingPrep) ? pendingPrep : null, head: t.lemma };
      out.places.push(place);
      out.place ??= place;
      pendingPrep = null;
      continue;
    }
    if (QUANTIFIERS.has(t.value)) { out.modifiers.push(t.lemma); continue; }
    if ((t.pos === 'DET' && !DEMONSTRATIVES.has(t.value)) || t.pos === 'CCONJ') continue;
    if (t.pos === 'ADV' || t.pos === 'INTJ') { takeAdverb(t); pendingPrep = flushPrep(pendingPrep); continue; }
    // A quality is content, so it trails as a modifier rather than being dropped.
    if (t.pos === 'ADJ') { out.modifiers.push(t.lemma); continue; }

    // An infinitive complement is the Target: what is wanted in "want to eat" is the eating.
    if (t.pos === 'VERB') {
      if (pendingPrep === 'to' || toks[i - 1]?.lemma === 'to') {
        if (!out.target) { out.target = t.lemma; out.targetSurface = t.value; }
        // "want me to move back" already has me in the Target, and the wanted action was
        // being thrown away rather than chained after it.
        else out.modifiers.push(t.lemma);
      }
      // A bare complement verb ("he said he would return home") is still content, and
      // Fonoran chains actions, so it trails rather than disappearing.
      else out.modifiers.push(t.lemma);
      pendingPrep = flushPrep(pendingPrep);
      continue;
    }
    if (!argument(t)) { pendingPrep = flushPrep(pendingPrep); continue; }

    if (pendingPrep && TEMPORAL_PREPS.has(pendingPrep)) out.modifiers.push(pendingPrep);
    if (pendingPrep && PLACE_PREPS.has(pendingPrep)) {
      const place = { prep: pendingPrep, head: word(t) };
      out.places.push(place);
      out.place ??= place;
    } else if (!out.target) {
      out.target = word(t);
      out.targetSurface = t.value;
    } else {
      // A second argument, or the object of a non-spatial preposition ("a story about the
      // old king"). Fonoran has one Target slot, so the rest trail instead of vanishing.
      out.modifiers.push(word(t));
    }
    pendingPrep = null;
  }
  flushPrep(pendingPrep);

  // Everything left of the predicate that is not the Actor. Qualities stacked on the Actor
  // ("the tall man walks" is man, walk, tall) and pre-verb phrases ("before the rain") are
  // content: only the head noun can be the Actor, so the rest has to land somewhere.
  let leftPrep = null;
  for (let i = 0; i < verbAt; i += 1) {
    const t = toks[i];
    if (i === actorAt || i === whIndex || i === quantityWhAt || coordinated.has(i)) continue;
    if (POSSESSIVES.has(t.value)) continue;
    if (t.pos === 'ADP') { flushPrep(leftPrep); leftPrep = t.lemma; continue; }
    if (TIME_WORDS.has(t.lemma)) { out.time ??= t.lemma; leftPrep = flushPrep(leftPrep); continue; }
    if (QUANTIFIERS.has(t.value)) { out.modifiers.push(t.lemma); continue; }
    if (t.pos === 'ADJ') { out.modifiers.push(t.lemma); continue; }
    if (t.pos === 'ADV' || t.pos === 'INTJ') { takeAdverb(t); leftPrep = flushPrep(leftPrep); continue; }
    // A determiner sits between a preposition and its noun, so it must not clear the
    // preposition: "After the rain" lost its after that way.
    if (t.pos === 'DET' && !DEMONSTRATIVES.has(t.value)) continue;
    if (!argument(t)) { leftPrep = flushPrep(leftPrep); continue; }
    if (leftPrep && TEMPORAL_PREPS.has(leftPrep)) out.modifiers.push(leftPrep);
    if (leftPrep && PLACE_PREPS.has(leftPrep)) {
      const place = { prep: leftPrep, head: word(t) };
      out.places.push(place);
      out.place ??= place;
    } else {
      out.modifiers.push(word(t));
    }
    leftPrep = null;
  }
  flushPrep(leftPrep);

  // "point to yourself and say your name" tags point as a noun, so the verb the
  // coordination found is the same one the predicate search found, and it rendered twice.
  out.coordinated = out.coordinated.filter(c => !(c.slot === 'action' && c.word === out.action));

  for (const t of toks) if (TIME_WORDS.has(t.lemma)) out.time ??= t.lemma;
  if (!out.time && out.tense !== 'present') out.time = out.tense;

  return out;
}
