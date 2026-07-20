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
  assert(beachResult.surface?.roman === 'be sak gi yetem ?', `beach roman: ${beachResult.surface?.roman}`);
  assert(beachResult.tokens.some(t => t.droppable && t.fonoran === 'be'), 'beach marks be droppable');
  const beachAlts = await attachTranslateAlternates(beachResult, beachRepaired, {
    input: 'Do you want to go to the beach?',
  });
  assert(
    beachAlts.alternates?.some(a => a.id === 'actor_dropped' && a.roman === 'sak gi yetem ?'),
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
