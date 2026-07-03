/**
 * Browser-safe multiple-choice helpers for Fonoran meaning exercises.
 * Kept separate from fonoran-playtests.js so Learn UI does not import Node storage.
 */

function normalizeMeaning(text) {
  return String(text ?? '').trim().toLowerCase();
}

/**
 * Build multiple-choice meaning options (correct + distractors).
 * @param {string} answer intended meaning
 * @param {string[]} pool other meanings to draw distractors from
 * @param {number} [choiceCount] total choices including answer (default 4)
 */
export function buildMeaningChoices(answer, pool, choiceCount = 4) {
  const correct = String(answer ?? '').trim();
  if (!correct) return [];

  const distractorCount = Math.max(0, choiceCount - 1);
  const used = new Set([normalizeMeaning(correct)]);
  const distractors = [];
  const candidates = [...(pool ?? [])].filter(Boolean);

  while (distractors.length < distractorCount && candidates.length) {
    const idx = Math.floor(Math.random() * candidates.length);
    const pick = candidates.splice(idx, 1)[0];
    const key = normalizeMeaning(pick);
    if (!key || used.has(key)) continue;
    used.add(key);
    distractors.push(pick);
  }

  while (distractors.length < distractorCount) {
    distractors.push(`other meaning ${distractors.length + 1}`);
  }

  return [correct, ...distractors]
    .map((value) => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map((c) => c.value);
}

/** Deterministic MC scoring — choice must match one of the offered options and equal the answer. */
export function scoreMultipleChoice(choice, answer, choices) {
  const normalizedAnswer = normalizeMeaning(answer);
  const normalizedChoice = normalizeMeaning(choice);
  if (!normalizedChoice) return false;
  if (!choices.some((item) => normalizeMeaning(item) === normalizedChoice)) return false;
  return normalizedChoice === normalizedAnswer;
}
