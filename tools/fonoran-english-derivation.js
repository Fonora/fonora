/**
 * English derivational morphology — parser-owned, candidates only.
 *
 * English builds families of words from one base: safe → safety → unsafely.
 * wink-nlp owns inflection (walked → walk) but deliberately not derivation, so
 * this is the one place allowed to know English affixes. It is NOT a stemmer:
 * nothing returned from here is ever emitted as an answer. Each entry is a
 * lookup *candidate* the resolver must still resolve against the lexicon with
 * full strength, and a hit is marked `interpreted` with the affix named, so a
 * reader can see "safety" reached `safe` through `-ty` rather than by magic.
 *
 * That guard is what separates this from the hand-rolled lemmatizer the
 * morphology module replaced (which suffix-stripped its way to non-words and
 * emitted them): a stripped form that resolves to nothing stays an honest gap.
 *
 * The stoplists carry the monomorphemic traps: `early` is not ear+ly, `unless`
 * is not un+less, `city` is not ci+ty. Every entry is a claim that the affix
 * rule misreads that word.
 */

/** Words ending in an affix string that are not derived with that affix. */
const STOPLISTS = {
  ly: new Set([
    'early', 'only', 'fly', 'family', 'ugly', 'holy', 'belly', 'jelly', 'silly',
    'ally', 'rally', 'tally', 'bully', 'apply', 'supply', 'reply', 'likely',
    'italy', 'july', 'butterfly', 'firefly', 'assembly', 'melancholy',
  ]),
  ty: new Set([
    'city', 'duty', 'pity', 'plenty', 'twenty', 'thirty', 'forty', 'fifty',
    'sixty', 'seventy', 'eighty', 'ninety', 'beauty', 'dirty', 'empty', 'party',
    'pretty', 'tasty', 'salty', 'mighty', 'guilty', 'county', 'treaty',
  ]),
  able: new Set(['table', 'cable', 'stable', 'able', 'fable', 'gable', 'parable', 'vegetable', 'syllable']),
  less: new Set(['unless', 'bless', 'less']),
  ful: new Set(['awful']),
  ness: new Set(['harness', 'witness', 'business', 'wilderness']),
  ion: new Set(['lion', 'onion', 'union', 'region', 'religion', 'million', 'billion', 'opinion', 'champion', 'companion', 'question', 'fashion', 'cushion']),
  ize: new Set(['realize', 'realized', 'realizes', 'realizing', 'size', 'sized', 'prize']),
  un: new Set(['under', 'until', 'unless', 'union', 'unit', 'unite', 'united', 'uncle', 'unique', 'uniform', 'universe', 'university']),
  non: new Set(['none', 'noon']),
  de: new Set([]),
  dis: new Set([
    'display', 'displayed', 'displays', 'discover', 'discovered', 'discovery',
    'discuss', 'discussed', 'discussion', 'distance', 'distant', 'disease',
    'distinct', 'dismiss', 'district', 'disturb', 'dish', 'dishes', 'discount',
    'dispute', 'disciple', 'discipline', 'disaster', 'discreet', 'discrete',
    'disperse', 'dismay', 'disdain',
  ]),
};

const MIN_BASE = 3;

/**
 * Same-concept suffix derivations: the derived word names the same concept as
 * its base, in another part of speech. Ordered specific to general; each rule
 * may propose several base spellings (English drops and mutates letters).
 *
 * `-able` is here on the "drinking water" reading: a creole renders *drinkable
 * water* as water-for-drinking, so the base verb as a modifier is the honest
 * nearest form, not a fabrication.
 */
const SUFFIX_RULES = [
  { suffix: 'iness', stop: 'ness', bases: stem => [`${stem}y`] },            // happiness → happy
  { suffix: 'ness', stop: 'ness', bases: stem => [stem] },                   // darkness → dark
  { suffix: 'ization', stop: 'ion', bases: stem => [stem, `${stem}e`] },     // centralization → central
  { suffix: 'izing', stop: 'ize', bases: stem => [stem, `${stem}e`] },       // centralizing → central
  { suffix: 'ized', stop: 'ize', bases: stem => [stem, `${stem}e`] },        // centralized → central
  { suffix: 'ize', stop: 'ize', bases: stem => [stem, `${stem}e`] },         // centralize → central
  { suffix: 'ation', stop: 'ion', bases: stem => [`${stem}ate`, `${stem}e`, stem] }, // celebration → celebrate
  { suffix: 'ion', stop: 'ion', bases: stem => [stem, `${stem}e`] },         // creation → create, action → act
  { suffix: 'ity', stop: 'ty', bases: stem => [stem, `${stem}e`] },          // equality → equal, purity → pure
  { suffix: 'ty', stop: 'ty', bases: stem => [stem] },                       // safety → safe
  { suffix: 'ily', stop: 'ly', bases: stem => [`${stem}y`] },                // happily → happy
  { suffix: 'ly', stop: 'ly', bases: stem => [stem, `${stem}le`] },          // badly → bad, gently → gentle
  { suffix: 'ful', stop: 'ful', bases: stem => [stem] },                     // fearful → fear
  { suffix: 'able', stop: 'able', bases: stem => [stem, `${stem}e`] },       // drinkable → drink, observable → observe
  { suffix: 'ible', stop: 'able', bases: stem => [stem, `${stem}e`] },       // convertible → convert
];

/**
 * Negating affixes: the derived word is the base under negation, so the result
 * is not one concept but a structure (`no` + base — rulebook rule 9 constituent
 * negation). Kept separate from SUFFIX_RULES because the caller must add the
 * negation, not just swap the word.
 */
const NEGATION_RULES = [
  { kind: 'prefix', affix: 'un', stop: 'un', bases: word => [word.slice(2)] },   // unsafe → no + safe
  { kind: 'prefix', affix: 'non', stop: 'non', bases: word => [word.slice(3)] }, // nonliving → no + living
  { kind: 'suffix', affix: 'less', stop: 'less', bases: word => [word.slice(0, -4)] }, // fearless → no + fear
  // Reversative de- is only trustworthy inside the -ize verbal family
  // (decentralized → no + central); bare de- words (delight, depart, design)
  // are not negations, so the rule refuses to fire without that suffix chain.
  { kind: 'prefix', affix: 'de', stop: 'de', requireVia: /iz/, bases: word => [word.slice(2)] },
  { kind: 'prefix', affix: 'dis', stop: 'dis', bases: word => [word.slice(3)] }, // disconnect → no + connect
];

function cleanWord(word) {
  return String(word ?? '').trim().toLowerCase();
}

/**
 * Same-concept base candidates for a derived English word, most specific affix
 * first. Applies rules to its own output once, so `carefully` reaches `care`
 * through `careful`. Pure candidates: the caller owns resolution and honesty.
 *
 * @param {string} word
 * @returns {Array<{ base: string, suffix: string }>}
 */
export function derivationalBases(word) {
  const w = cleanWord(word);
  if (!w) return [];
  const out = [];
  const seen = new Set([w]);
  const expand = (form, viaSuffix) => {
    for (const rule of SUFFIX_RULES) {
      if (!form.endsWith(rule.suffix)) continue;
      if (STOPLISTS[rule.stop]?.has(form)) continue;
      const stem = form.slice(0, -rule.suffix.length);
      if (stem.length < MIN_BASE) continue;
      for (const base of rule.bases(stem)) {
        if (seen.has(base)) continue;
        seen.add(base);
        const suffix = viaSuffix ? `${rule.suffix}+${viaSuffix}` : rule.suffix;
        out.push({ base, suffix });
      }
    }
  };
  expand(w, null);
  // One level of chaining: carefully → careful → care. Snapshot first, because
  // expand pushes onto `out` while we read it.
  for (const { base, suffix } of [...out]) expand(base, suffix);
  return out;
}

/**
 * Read a word as a negated base (`unsafe` → not + `safe`), or null.
 *
 * Returns candidates only; the caller must check that a base resolves in the
 * lexicon and must itself supply the negation structure. Reversative un-verbs
 * (untie) read as "make un-X-ed", which the same structure carries.
 *
 * Prefix checks also run on suffix-derived bases, so `decentralized` reaches
 * `central` through -ized and then de- (`no` + central). The affix names the
 * whole chain (`de+ized`) so the reader can retrace it.
 *
 * @param {string} word
 * @returns {Array<{ base: string, affix: string }>}
 */
export function negatedBases(word) {
  const w = cleanWord(word);
  if (!w) return [];
  const out = [];
  const seen = new Set([w]);
  const tryForm = (form, via) => {
    for (const rule of NEGATION_RULES) {
      if (rule.requireVia && !rule.requireVia.test(via ?? '')) continue;
      const matches = rule.kind === 'prefix' ? form.startsWith(rule.affix) : form.endsWith(rule.affix);
      if (!matches) continue;
      if (STOPLISTS[rule.stop]?.has(form)) continue;
      for (const base of rule.bases(form)) {
        if (base.length < MIN_BASE || seen.has(base)) continue;
        seen.add(base);
        out.push({ base, affix: via ? `${rule.affix}+${via}` : rule.affix });
      }
    }
  };
  tryForm(w, null);
  for (const { base, suffix } of derivationalBases(w)) tryForm(base, suffix);
  return out;
}
