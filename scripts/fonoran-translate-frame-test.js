#!/usr/bin/env node
/**
 * Smoke tests for translateFromFrame (LLM frame renderer) and LLM frame repair.
 */
import { translateFromFrame, frameSlotsToSemanticSlots } from '../tools/fonoran-translator.js';
import {
  repairLlmFrame,
  frameUsesWhComposition,
  hasWhContentWord,
  validateLlmFrame,
  mergeSentenceResults,
} from '../tools/fonoran-llm-translate.js';
import {
  normalizeFrameParticles,
  checkLlmGrammarViolations,
  simplifyMotionFrame,
  isAddresseeDroppable,
} from '../tools/fonoran-llm-grammar-brief.js';
import {
  normalizeWePrimaryFrame,
  attachTranslateAlternates,
  isCollectiveWeSubject,
} from '../tools/fonoran-translate-alternates.js';
import { translate } from '../tools/fonoran-translate.js';
import { closeStore } from '../tools/fonoran-store.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const slots = frameSlotsToSemanticSlots({
    subject: ['mi'],
    event: ['move'],
    object: ['place'],
    time: [],
    path: [],
    modifiers: [],
  });
  assert(slots.subject[0]?.concept_id === 'mi' || slots.subject[0]?.particle === 'mi', 'mi in subject');

  const frame = {
    slots: {
      subject: ['ba'],
      event: ['kel'],
      modifiers: ['equal'],
    },
    is_question: false,
    unresolved: [],
  };

  const equalFrame = {
    slots: { event: ['equal'] },
    is_question: false,
    unresolved: [],
  };

  const phraseResult = await translateFromFrame(frame, { input: 'All men are created equal.' });
  assert(phraseResult.tokens.some(t => t.resolved), 'at least one resolved token');
  assert(phraseResult.surface?.roman, 'roman surface produced');

  const equalToken = (await translateFromFrame(equalFrame, { input: 'equal' })).tokens.find(t => t.concept_id === 'equal');
  assert(equalToken?.resolved && equalToken?.fonoran, `equal resolves: ${JSON.stringify(equalToken?.fonoran)}`);

  const badExistentialFrame = {
    slots: {
      subject: ['no', 'know', 'person'],
      event: [],
      object: [],
      path: [],
      time: [],
      modifiers: ['other', 'near', 'addressee'],
    },
    is_question: true,
    unresolved: [],
  };
  assert(!hasWhContentWord('Are there other people near you?'), 'existential is not wh-content');
  assert(frameUsesWhComposition(badExistentialFrame), 'detects WH misuse');
  const repaired = await repairLlmFrame(badExistentialFrame, 'Are there other people near you?');
  assert(!frameUsesWhComposition(repaired), 'repair removes WH composition');
  const repairedResult = await translateFromFrame(repaired, { input: 'Are there other people near you?' });
  assert(
    repairedResult.surface?.roman?.includes('balek')
      && repairedResult.surface?.roman?.includes('dal')
      && repairedResult.surface?.roman?.includes('be')
      && !repairedResult.surface?.roman?.includes('tak'),
    `existential repair roman: ${repairedResult.surface?.roman}`,
  );

  const cached = await translate('Are there other people near you', { sourceLang: 'en', engine: 'llm', skipCache: false });
  assert(
    cached.surface?.roman?.includes('balek')
      && cached.surface?.roman?.includes('be')
      && !cached.surface?.roman?.includes('tak'),
    `cached existential: ${cached.surface?.roman}`,
  );

  const negFrame = normalizeFrameParticles({
    slots: { subject: ['mi'], event: ['neg', 'move'], object: [], path: [], time: [], modifiers: [] },
    is_question: false,
    unresolved: [],
  });
  assert(negFrame.slots.event[0] === 'no', 'neg normalizes to no particle');

  const grammarCheck = checkLlmGrammarViolations(badExistentialFrame, 'Are there other people near you?');
  assert(grammarCheck.violations.some(v => v.kind === 'wh_on_yesno'), 'grammar check flags WH on yes/no');

  const dyadicWeFrame = {
    slots: { subject: ['mi', 'addressee'], event: ['need'], object: ['shelter'], path: [], time: [], modifiers: ['now'] },
    is_question: false,
    unresolved: [],
  };
  const normalizedWe = normalizeWePrimaryFrame(dyadicWeFrame, 'We need to find shelter now');
  assert(isCollectiveWeSubject(normalizedWe), 'we primary defaults to collective without dyadic cue');

  const withAlts = await attachTranslateAlternates(
    await translateFromFrame(normalizedWe, { input: 'We need to find shelter now' }),
    normalizedWe,
    { input: 'We need to find shelter now' },
  );
  assert(withAlts.alternates?.length === 1, 'we alternate offered');
  assert(withAlts.alternates[0].roman?.includes('mi be'), `dyadic alternate: ${withAlts.alternates[0].roman}`);
  assert(withAlts.surface?.roman?.includes('dan'), `collective primary: ${withAlts.surface?.roman}`);

  // Grammar enforcement: canonical modifier order (quality before place).
  // "You are safe here" — LLM frame lists modifiers [here, safe]; enforcement
  // reorders to [safe, here] so the surface is deterministically `be tampe nam`.
  const safeHereFrame = {
    slots: { subject: ['addressee'], event: [], object: [], path: [], time: [], modifiers: ['here', 'safe'] },
    is_question: false,
    unresolved: [],
  };
  const safeHere = await translateFromFrame(safeHereFrame, { input: 'You are safe here' });
  const safeRoman = safeHere.surface?.roman ?? '';
  const safeIdx = safeRoman.indexOf('kamgu') >= 0 ? safeRoman.indexOf('kamgu') : safeRoman.indexOf('tampe');
  const hereIdx = safeRoman.indexOf('nam');
  assert(
    safeRoman.startsWith('be ') && safeIdx >= 0 && hereIdx > safeIdx,
    `safe-here modifier order (quality before place): ${safeRoman}`,
  );

  // Sentence segmentation: multiple single-sentence frames compose into discrete
  // Fonoran sentences with a period terminator each — never one run-on stream.
  const sentA = await translateFromFrame(
    { slots: { event: ['move'], path: ['here'] }, is_question: false, unresolved: [] },
    { input: 'It moves here.' },
  );
  const sentB = await translateFromFrame(
    { slots: { subject: ['ba'], event: ['move'] }, is_question: false, unresolved: [] },
    { input: 'A person moves.' },
  );
  const mergedTwo = await mergeSentenceResults(
    [sentA, sentB],
    ['It moves here.', 'A person moves.'],
    { input: 'It moves here. A person moves.' },
  );
  assert(mergedTwo.sentences?.length === 2, `two discrete sentences: ${mergedTwo.sentences?.length}`);
  assert(
    mergedTwo.surface.roman === `${sentA.surface.roman} ${sentB.surface.roman}`,
    `segmented surface (no period terminators): "${mergedTwo.surface.roman}"`,
  );
  assert(mergedTwo.mode === 'discourse', `multi-sentence mode is discourse: ${mergedTwo.mode}`);

  // Rule 4: serial want+move, bare destination, droppable addressee.
  const beachFrame = {
    slots: {
      subject: ['addressee'],
      event: ['want'],
      object: ['move'],
      path: ['path', 'beach'],
      time: [],
      modifiers: [],
    },
    is_question: true,
    unresolved: [],
  };
  const beachRepaired = simplifyMotionFrame(beachFrame, 'Do you want to go to the beach?');
  assert(
    JSON.stringify(beachRepaired.slots.event) === JSON.stringify(['want', 'move']),
    `beach serial event: ${JSON.stringify(beachRepaired.slots.event)}`,
  );
  assert(
    JSON.stringify(beachRepaired.slots.path) === JSON.stringify(['beach']),
    `beach bare path: ${JSON.stringify(beachRepaired.slots.path)}`,
  );
  assert(isAddresseeDroppable(beachRepaired, 'Do you want to go to the beach?'), 'beach Actor droppable');
  assert(
    !isAddresseeDroppable(beachRepaired, 'Do you want me to move back?'),
    'mixed persons not droppable',
  );
  const beachResult = await translateFromFrame(beachRepaired, { input: 'Do you want to go to the beach?' });
  assert(
    /^be sak gi yetem\s*\?$/.test(String(beachResult.surface?.roman ?? '')),
    `beach roman: ${beachResult.surface?.roman}`,
  );
  assert(beachResult.tokens.some(t => t.droppable && t.fonoran === 'be'), 'beach marks be droppable');
  const beachAlts = await attachTranslateAlternates(beachResult, beachRepaired, {
    input: 'Do you want to go to the beach?',
  });
  assert(
    beachAlts.alternates?.some(a => a.id === 'actor_dropped' && /^sak gi yetem\s*\?$/.test(String(a.roman ?? ''))),
    `beach casual alt: ${JSON.stringify(beachAlts.alternates?.map(a => a.roman))}`,
  );

  const toward = simplifyMotionFrame({
    slots: { subject: ['mi'], event: ['want'], object: ['move'], path: ['path', 'ye'], time: [], modifiers: [] },
    is_question: false,
  }, 'I want to go toward the water.');
  assert(
    JSON.stringify(toward.slots.path) === JSON.stringify(['path', 'water']),
    `toward keeps nan: ${JSON.stringify(toward.slots.path)}`,
  );

  // Negation repair: orphaned `no` (or `no` before a verb parked outside event)
  // must not invent Action negation when English has no clause-negation cue;
  // real "did not / never / no X" must still restore dropped event `no`.
  const bogusLocalNo = normalizeFrameParticles({
    slots: {
      subject: ['animal'],
      event: ['walk'],
      object: [],
      path: ['earth'],
      time: ['long_ago'],
      modifiers: ['no', 'old', 'big'],
    },
    is_question: false,
    unresolved: [],
  });
  assert(
    !bogusLocalNo.slots.event.some(x => String(x).toLowerCase() === 'no'),
    `no+quality stays out of event: ${JSON.stringify(bogusLocalNo.slots.event)}`,
  );
  assert(
    bogusLocalNo.slots.modifiers[0] === 'no' && bogusLocalNo.slots.modifiers[1] === 'old',
    `no+quality left in modifiers: ${JSON.stringify(bogusLocalNo.slots.modifiers)}`,
  );
  const strippedInvented = await repairLlmFrame(
    {
      slots: {
        subject: ['animal'],
        event: ['no', 'walk'],
        object: [],
        path: [],
        time: ['long_ago'],
        modifiers: ['old'],
      },
      is_question: false,
      unresolved: [],
    },
    'Long ago the animal walked.',
  );
  assert(
    !strippedInvented.slots.event.some(x => ['no', 'neg'].includes(String(x).toLowerCase())),
    `strip invented event no: ${JSON.stringify(strippedInvented.slots.event)}`,
  );
  assert(strippedInvented._stripped_invented_negation === true, 'marks stripped invented negation');
  const realNegKept = await repairLlmFrame(
    {
      slots: { subject: ['mi'], event: ['walk'], object: [], path: [], time: [], modifiers: [] },
      is_question: false,
      unresolved: [],
    },
    'I did not walk.',
  );
  assert(
    realNegKept.slots.event[0] === 'no',
    `restore real negation: ${JSON.stringify(realNegKept.slots.event)}`,
  );
  const determinerNoKept = await repairLlmFrame(
    {
      slots: { subject: ['person'], event: ['come'], object: [], path: [], time: [], modifiers: [] },
      is_question: false,
      unresolved: [],
    },
    'No people came.',
  );
  assert(
    determinerNoKept.slots.event[0] === 'no',
    `restore determiner no: ${JSON.stringify(determinerNoKept.slots.event)}`,
  );

  // Reverse path: natural-language pasted with Fonoran source must not dump
  // word-by-word gaps — detect wrong direction instead.
  const { looksLikeWrongSourceLanguage, glossRomanPhrase, translateFromFonoran } = await import('../tools/fonoran-reverse-translate.js');
  const { buildResolveContext } = await import('../tools/fonoran-english-resolve.js');
  const { getParticleRuntime } = await import('../tools/fonoran-particles.js');
  const { promoteTemporalSceneToTime } = await import('../tools/fonoran-llm-grammar-brief.js');
  const revCtx = await buildResolveContext();
  const revParticles = await getParticleRuntime();
  const englishAsFonoran = glossRomanPhrase(
    'long ago when the world was young the great beast walked upon the earth',
    revCtx,
    revParticles,
  );
  assert(looksLikeWrongSourceLanguage(englishAsFonoran), 'English prose flagged as wrong reverse source');
  const realFonoran = glossRomanPhrase('ni kal ta difet giti fen di fenfo', revCtx, revParticles);
  assert(!looksLikeWrongSourceLanguage(realFonoran), 'real Fonoran not flagged as wrong source');
  const wrongDir = await translateFromFonoran(
    'long ago, when the world was young, the great beast walked upon the earth.',
    { sourceLang: 'fonoran-roman', inputMode: 'roman', targetLang: 'en', engine: 'lexical' },
  );
  assert(wrongDir.ok === false && wrongDir.code === 'wrong_source_language', `wrong-dir error: ${JSON.stringify(wrongDir)}`);
  const rightDir = await translateFromFonoran('ni kal ta giti fen', {
    sourceLang: 'fonoran-roman',
    inputMode: 'roman',
    targetLang: 'en',
    engine: 'lexical',
  });
  assert(rightDir.ok !== false, `real Fonoran reverse ok: ${rightDir.error}`);

  // Dummy "difet ta mo" scene frames must collapse into the main clause.
  const { collapseDummySceneFrames, isDummyTemporalSceneFrame } = await import('../tools/fonoran-llm-grammar-brief.js');
  assert(isDummyTemporalSceneFrame({
    slots: { time: ['long_ago', 'ta'], event: ['do'], subject: [], object: [], path: [], modifiers: [] },
  }), 'difet ta mo is dummy scene');
  assert(!isDummyTemporalSceneFrame({
    slots: { subject: ['animal'], event: ['do'], time: ['ta'], object: ['thing'], path: [], modifiers: [] },
  }), 'real actor doing something is not dummy scene');
  const collapsedMo = collapseDummySceneFrames([
    { slots: { time: ['long_ago', 'ta'], event: ['do'], subject: [], object: [], path: [], modifiers: [] } },
    { slots: { time: ['beginning', 'world', 'ta'], event: ['do'], subject: [], object: [], path: [], modifiers: [] } },
    {
      slots: {
        subject: ['big', 'animal'],
        event: ['walk'],
        path: ['surface', 'earth'],
        time: ['ta'],
        object: [],
        modifiers: [],
      },
    },
  ]);
  assert(collapsedMo.length === 1, `collapsed to one frame: ${collapsedMo.length}`);
  assert(
    !collapsedMo[0].slots.event.includes('do'),
    `no dummy do left: ${JSON.stringify(collapsedMo[0].slots.event)}`,
  );
  assert(
    collapsedMo[0].slots.time.includes('long_ago')
      && collapsedMo[0].slots.time.includes('beginning')
      && collapsedMo[0].slots.time.includes('world'),
    `scene folded into time: ${JSON.stringify(collapsedMo[0].slots.time)}`,
  );
  const collapsedSurface = await translateFromFrame(collapsedMo[0], {
    input: 'Long ago, when the world was young, the animal walked on the earth.',
  });
  assert(
    /^difet lukan fenfo ni kal ta giti ten fen\.?$/.test(collapsedSurface.surface?.roman ?? ''),
    `collapsed surface: ${collapsedSurface.surface?.roman}`,
  );

  // Scene structure: temporal concepts front; ta stays by Action; not a flat bag.
  const scenePromoted = promoteTemporalSceneToTime({
    slots: {
      subject: ['big', 'animal'],
      event: ['walk'],
      path: ['surface', 'earth'],
      time: ['long_ago', 'ta'],
      modifiers: ['beginning', 'world'],
    },
  });
  assert(
    JSON.stringify(scenePromoted.slots.time.slice(0, 3)) === JSON.stringify(['long_ago', 'beginning', 'world']),
    `scene promoted+sorted: ${JSON.stringify(scenePromoted.slots.time)}`,
  );
  assert(scenePromoted.slots.time.at(-1) === 'ta', 'ta stays last in time slot');
  assert(scenePromoted.slots.modifiers.length === 0, 'modifiers cleared of scene');
  const sceneSurface = await translateFromFrame(scenePromoted, {
    input: 'Long ago, when the world was young, the animal walked on the earth.',
  });
  const sceneRoman = sceneSurface.surface?.roman ?? '';
  assert(
    /^difet lukan fenfo ni kal ta giti ten fen\.?$/.test(sceneRoman),
    `scene-fronted surface: ${sceneRoman}`,
  );
  const roles = sceneSurface.tokens.filter(t => t.kind !== 'punctuation').map(t => t.role);
  const difetIdx = sceneRoman.split(/\s+/).indexOf('difet');
  const niIdx = sceneRoman.split(/\s+/).indexOf('ni');
  const taIdx = sceneRoman.split(/\s+/).indexOf('ta');
  const gitiIdx = sceneRoman.split(/\s+/).indexOf('giti');
  assert(difetIdx === 0 && niIdx > difetIdx && taIdx > niIdx && gitiIdx === taIdx + 1,
    `scene order difet…ni…ta giti: ${sceneRoman} roles=${roles.join(',')}`);

  console.log('translateFromFrame:', phraseResult.surface.roman);
  console.log('segmented two:', mergedTwo.surface.roman);
  console.log('existential repair:', repairedResult.surface.roman);
  console.log('safe-here order:', safeHere.surface.roman);
  console.log('equal parts:', equalToken?.parts?.join(' + '));
  console.log('beach:', beachResult.surface.roman);
  console.log('OK');
}

main()
  .catch(err => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeStore());
