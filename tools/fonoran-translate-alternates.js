/**
 * Optional alternate readings for the translator (convention over configuration).
 * Rule-based — never a second LLM pass.
 */
import { translateFromFrame } from './fonoran-translator.js';
import { attachTranslatorPlayback } from './fonoran-playback-build.js';

/** English surface cues that justify mi + addressee instead of collective for "we". */
const DYADIC_WE_CUES = /\b(each other|one another|you and i|you and me|both of us|the two of us|we two|together we|we together|just us|you and i both)\b/i;

export function sourceHasWe(text) {
  return /\b(we|us)\b/i.test(String(text ?? ''));
}

export function sourceHasDyadicWeCue(text) {
  return DYADIC_WE_CUES.test(String(text ?? ''));
}

function subjectIds(frame) {
  return (frame?.slots?.subject ?? []).map(s => String(s ?? '').trim().toLowerCase()).filter(Boolean);
}

function isCollectiveWeRef(id) {
  const k = String(id ?? '').toLowerCase();
  return k === 'collective' || k === 'dan';
}

function isAddresseeWeRef(id) {
  const k = String(id ?? '').toLowerCase();
  return k === 'addressee' || k === 'be';
}

export function isCollectiveWeSubject(frame) {
  const ids = subjectIds(frame);
  return ids.some(isCollectiveWeRef) && !ids.includes('mi');
}

export function isDyadicWeSubject(frame) {
  const ids = subjectIds(frame);
  return ids.includes('mi') && ids.some(isAddresseeWeRef);
}

/**
 * Primary frame policy: default we → collective unless source has explicit dyadic cue.
 */
export function normalizeWePrimaryFrame(frame, sourceText) {
  if (!frame?.slots || !sourceHasWe(sourceText)) return frame;
  if (sourceHasDyadicWeCue(sourceText)) return frame;
  if (!isDyadicWeSubject(frame)) return frame;

  return {
    ...frame,
    slots: {
      ...frame.slots,
      subject: ['collective'],
    },
  };
}

function swapWeSubject(frame, mode) {
  const subject = mode === 'dyadic' ? ['mi', 'addressee'] : ['collective'];
  return {
    ...frame,
    slots: {
      ...frame.slots,
      subject,
    },
  };
}

/**
 * Build the optional we-reading alternate (collective ↔ dyadic).
 */
export async function buildWeAlternate(primaryResult, frame, options = {}) {
  if (!sourceHasWe(options.input)) return null;

  let altFrame = null;
  let note = '';
  let id = '';

  if (isCollectiveWeSubject(frame)) {
    altFrame = swapWeSubject(frame, 'dyadic');
    note = 'Dyadic: speaker and addressee (you and I).';
    id = 'we_dyadic';
  } else if (isDyadicWeSubject(frame)) {
    altFrame = swapWeSubject(frame, 'collective');
    note = 'Group: collective we (our party).';
    id = 'we_collective';
  } else {
    return null;
  }

  const altResult = await translateFromFrame(altFrame, {
    lab: options.lab,
    input: options.input,
    sourceLang: options.sourceLang,
  });

  const primaryRoman = primaryResult?.surface?.roman?.replace(/\s*\?\s*$/, '').trim();
  const altRoman = altResult?.surface?.roman?.replace(/\s*\?\s*$/, '').trim();
  if (!altRoman || altRoman === primaryRoman) return null;

  return {
    id,
    note,
    roman: altResult.surface?.roman ?? '',
    surface: altResult.surface,
    playback: altResult.playback,
    tokens: altResult.tokens,
    frame: altFrame,
  };
}

/** Attach rule-based alternates to a translator result. */
export async function attachTranslateAlternates(result, frame, options = {}) {
  if (!result || result.error) return result;

  const alternates = [];
  const weAlt = await buildWeAlternate(result, frame, options);
  if (weAlt) alternates.push(weAlt);

  if (alternates.length) {
    result.alternates = alternates;
  }
  return result;
}

/** Re-render alternates after client-side rules load (playback only). */
export async function refreshAlternatePlayback(alternate, lab = null) {
  if (!alternate?.tokens?.length) return alternate;
  return attachTranslatorPlayback({ tokens: alternate.tokens }, null);
}
