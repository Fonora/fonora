#!/usr/bin/env node
/**
 * Smoke tests for translateFromFrame (LLM frame renderer) and LLM frame repair.
 */
import { translateFromFrame, frameSlotsToSemanticSlots } from '../tools/fonoran-translator.js';
import { repairLlmFrame, frameUsesWhComposition, hasWhContentWord, validateLlmFrame } from '../tools/fonoran-llm-translate.js';
import { normalizeFrameParticles, checkLlmGrammarViolations } from '../tools/fonoran-llm-grammar-brief.js';
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

  const equalToken = (await translateFromFrame(equalFrame, { input: 'equal' })).tokens.find(t => t.fonoran === 'homas');
  assert(equalToken?.parts?.length === 2, `equal compound parts: ${JSON.stringify(equalToken?.parts)}`);

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
    repairedResult.surface?.roman?.includes('honen balek dal be') && !repairedResult.surface?.roman?.includes('tak'),
    `existential repair roman: ${repairedResult.surface?.roman}`,
  );

  const cached = await translate('Are there other people near you', { sourceLang: 'en', engine: 'llm', skipCache: false });
  assert(
    cached.surface?.roman?.includes('honen balek dal be') && !cached.surface?.roman?.includes('tak'),
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

  console.log('translateFromFrame:', phraseResult.surface.roman);
  console.log('existential repair:', repairedResult.surface.roman);
  console.log('equal parts:', equalToken?.parts?.join(' + '));
  console.log('OK');
}

main()
  .catch(err => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeStore());
