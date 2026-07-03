---
status: Active
date: 2026-06-30
phase: phase-3
---

# Typing an invented script

## Research Question

By late June 2026, Phase III had closed most of the *consumption* side of literacy. Learners could decode composed symbols (RN-01), hear arbitrary text mapped through the IPA pipeline (RN-02), and compile English into nearest approved Fonoran concepts with honest red gaps ([RN-15](/research/notes/concepts-are-canonical-sounds-are-editorial-proposals)). [RN-12](/research/notes/compiling-english-into-meaning) had reframed success around recoverable meaning between root-knowers, but the puzzle-conversation protocol it defined assumes participants can eventually *produce* expressions, not only read them.

The gap was practical and obvious in daily use: every prior tool showed Fonora script as output. The old Keyboard tab let you click primitive place and manner glyphs or use number-key shortcuts, but it did not behave like typing. You inserted ○ or ⌔ one at a time and assembled words manually, closer to a symbol palette than to literacy. RN-15 closed by naming the problem directly:

**How do learners physically produce Fonora script, and can spelling skill be measured rather than assumed?**

Reading a script you cannot write is only half a literacy. This note asks whether a familiar input surface, QWERTY roman keys mapped onto the phoneme inventory, can close the read-write loop and give the project a scored drill surface for its central learnability claim.

## Hypothesis

The working hypothesis was that a **visual on-screen keyboard** mapping the US QWERTY layout onto Fonora's phoneme grid, paired with **scored practice modes**, would:

1. Close the read-write loop so learners can produce script, not only decode it.
2. Reinforce the script's phonetic logic by routing keypresses through the same roman phoneme keys the transliterator already uses.
3. Turn "can you write it?" into something with a pass/fail score: a prerequisite for any later claim that Fonora is learnable on a short timeline.

The hypothesis was not that QWERTY roman keys are the *best* long-term input method for an invented script. It was that reusing a layout learners already have muscle memory for would lower the activation energy enough to test production skill now, while a dedicated Fonora keyboard layout could wait.

## Approach

The work shipped across four commits on Jun 30, 2026, replacing the symbol-palette keyboard from the initial commit in a single day.

### What existed before

From the initial commit (`63b79cf`) through Jun 29, the Keyboard tab was a **primitive picker**: nine place and manner buttons, a mapping table of number keys (1–9) and letter shortcuts to individual glyphs, and direct cursor insertion. [`renderSymbolButtons`](https://github.com/Fonora/fonora/blob/main/js/app.js) in the pre-IME `app.js` built buttons from `rules.places` and `rules.modifiers`; `attachKeyboardShortcuts` mapped digits and letters to those same primitives. Composing a consonant meant clicking or typing two primitives in sequence yourself. The decode quiz reused the same button strip. This was adequate for researchers testing composition rules; it was not a typing interface.

### Visual QWERTY IME (`0305077`)

Commit `0305077` replaced the palette with four modules: layout ([`js/fonora-keyboard-layout.js`](../js/fonora-keyboard-layout.js)), roman-key composer ([`js/fonora-keyboard-compose.js`](../js/fonora-keyboard-compose.js)), UI widget ([`js/fonora-keyboard-ui.js`](../js/fonora-keyboard-ui.js)), and compose regression tests ([`js/fonora-keyboard-compose.test.js`](../js/fonora-keyboard-compose.test.js)).

**Design decisions grounded in the articulation grid:**

- **Roman keys, Fonora glyphs out.** Each key cap shows the composed symbol for its primary phoneme, resolved at render time from `buildSoundToSymbolsMap(rules)`, so rule changes propagate without hardcoded caps.
- **Q = vowel indicator.** The dedicated vowel marker (⚬ in current rules) sits on `KeyQ` as a raw symbol insert, decoupled from the throat-place row that RN-01 originally repurposed for vowels.
- **Compose, don't memorize digraph keys.** Multi-letter phonemes share key prefixes: `t` prints /t/ immediately; `t` + `h` retroactively upgrades the glyph to /th/ (`RETROACTIVE_H_DIGRAPHS` in the composer). Same pattern for /dh/, /sh/, /kh/, /gh/. The `c` key always emits /ch/ in one press.
- **Submenu popups for ambiguous prefixes.** Vowels and `n` have multiple phoneme continuations (`ee`, `eye`, `ng`, `ñ`). Pressing such a key prints the single-letter phoneme immediately, then opens a popup listing alternates (up to nine, selectable by click or digit keys 1–9). Double-tap resolves when no longer phoneme exists (e.g. `a` + `a` → /a/).
- **Tight output.** Space and Enter flush the compose buffer before inserting whitespace or submitting, matching RN-01's rule that composed symbols render as a single visual unit.

Physical keyboard events bind when the keyboard's tab is active (`data-fonora-tab` or a custom `isActive` callback), intercepting letter keys, Space, Enter, Backspace, Escape, and Tab without stealing focus from other inputs.

### Responsive layout (`7e3e0aa`)

Commit `7e3e0aa` adjusted CSS so the keyboard uses full-width flex keys, larger touch targets, and safe-area padding. The constraint from the stub, usable on small screens, not only desktop, was treated as a ship blocker for the same day.

### Scored practice modes (`6c4a7c8`)

Commit `6c4a7c8` split the old freeform Keyboard tab into two drills sharing [`js/fonora-typing-practice.js`](../js/fonora-typing-practice.js):

**Keyboard Testing** ([`/tools#keyboard`](/tools#keyboard)), phoneme prompts, not vocabulary. [`js/keyboard-test-words.js`](../js/keyboard-test-words.js) builds ~200 test cases: every vowel in isolation, every consonant + /a/, and nonsense words chosen to exercise digraphs, /ng/, /ñ/, and repeated-consonant exclusions. Prompts display as phoneme chains (`p · e · ñ · a`); expected glyphs are the concatenation of each phoneme's symbols under current rules. This mode tests the *keyboard mapping*, independent of Fonoran lexicon.

**Spelling Practice** ([`/learn#writing`](/learn#writing)): roman Fonoran words from the live lab. [`js/fonora-spelling-practice.js`](../js/fonora-spelling-practice.js) fetches `/api/fonoran/bootstrap`, builds prompts from approved roots and compounds via `romanToFonoraScript`, and skips entries with encoding warnings. The learner sees a roman spelling (`kaso`) and meaning gloss; success is exact normalized glyph match.

Both modes share the practice keyboard layout (`layout: 'practice'`): Enter runs check, Tab advances to the next word, and incorrect answers show a side-by-side glyph comparison (yours → expected).

### Learn / Tools split (`1ad6139`, `816a73e`)

The same day, commit `1ad6139` split the monolithic Script app into `/learn` (Reading, Hearing, Writing) and `/tools` (Transliterator, Keyboard Testing, etc.). Spelling Practice landed under Learn → Writing; Keyboard Testing under Tools. Commit `816a73e` fixed a routing bug where bare `/tools` redirected to Learn (blocking signed-in access to Keyboard Testing) and corrected `isActive` detection so physical Enter and vowel popups worked when the Writing panel was visible inside the Learn shell.

## Evaluation

There was no formal user study. Evaluation was automated regression plus manual exercise of the two practice flows.

**Unit tests.** [`js/fonora-keyboard-compose.test.js`](../js/fonora-keyboard-compose.test.js) covers retroactive digraph upgrades, vowel submenu resolution (`n` + `n` → /ñ/), `c` → /ch/, buffer flush on space boundaries, and backspace undoing pending submenu state. [`js/keyboard-test-words.test.js`](../js/keyboard-test-words.test.js) verifies that every test case encodes under current rules and that `uncoveredKeyboardPhonemes` stays empty for the declared `KEYBOARD_PHONEMES` inventory. Both run in the main `js/tests.js` suite.

**Informal drill review.** The questions the team was actually asking were narrower than "is Fonora easy to learn":

- **Coverage:** does every phoneme on the QWERTY map produce the correct glyph, including digraphs and vowel collisions?
- **Compose UX:** can a naive typist produce /th/ without learning a special key, and disambiguate /ee/ from /e/ without a manual?
- **Scoring integrity:** does `normalizeSymbolInput` make the check fair when accidental spacing creeps in?
- **Separation of concerns:** can keyboard mapping be tested with nonsense phoneme words before mixing in Fonoran vocabulary?

No longitudinal data was collected on whether practice scores improve with time, or whether keyboard-testing success predicts spelling-practice success on real roots.

## Findings

**The read-write loop closed technically.** Learners can now decode, hear, translate, and type Fonora script through the same web app. The old primitive palette is gone from the main keyboard surface; production routes through roman phoneme keys and emits composed glyphs.

**QWERTY as IME lowered the activation barrier, at the cost of an extra abstraction layer.** Typing `person` in Spelling Practice still requires knowing the roman Fonoran spelling, not the articulatory decomposition. The keyboard reinforces *phoneme → glyph* mapping, not *place × manner → glyph* reasoning directly. That is consistent with how the transliterator already worked, but it means the keyboard is an output method for an existing roman phoneme layer, not a novel articulatory teaching surface.

**Compose logic was harder than the layout.** The submenu model (print immediately, offer upgrades) emerged from real ambiguity in the phoneme inventory: five vowel letters map to twelve vowel phonemes; `n` spans /n/, /ng/, and /ñ/; retroactive /h/ digraphs avoid dedicating keys to /th/ and /sh/. Commit `6c4a7c8` refined this after the first IME pass; the initial `0305077` composer was simpler. The final behavior is tested but not proven intuitive without a tutorial.

**Two practice modes serve different gates.** Keyboard Testing is a script-QA surface: it fails if any phoneme key stops encoding. Spelling Practice is a vocabulary surface: it fails if lab roots change or bootstrap is unavailable. Spelling Practice deliberately skips words with `romanToFonoraScript` warnings, so the drill set shrinks when rules are incomplete: an honest constraint, not a bug.

**Scoring exists; learnability is still unmeasured.** Correct/incorrect badges and glyph diffs make individual attempts auditable. Nothing yet connects practice scores to the Constitution's campfire test or to RN-17's recoverability protocol. The stub's claim that this "feeds directly into evaluating the project's central learnability claim" describes intent, not evidence collected on Jun 30.

## What Changed

The QWERTY IME became the standard production path for Fonora script in the web app:

- **Keyboard widget** (`createFonoraKeyboard` in [`js/fonora-keyboard-ui.js`](../js/fonora-keyboard-ui.js)) is reused anywhere a textarea needs Fonora input, Writing practice today; extensible to other surfaces.
- **Compose rules** live in [`js/fonora-keyboard-compose.js`](../js/fonora-keyboard-compose.js) and are regression-locked; changes to [`docs/language-rules.md`](../language-rules.md) flow through automatically via `buildSoundToSymbolsMap`.
- **Practice infrastructure** (`createTypingPractice`) separates prompt loading from keyboard rendering, new drills can plug in different word sources without duplicating the IME.

What was superseded:

- **Primitive symbol buttons** as the primary keyboard UI (number-key glyph insertion). The decode quiz still uses a compact symbol button strip; the main typing flow does not.
- **Freeform "type symbols here"** as the Keyboard tab's purpose. The tab is now Keyboard Testing: a scored phoneme drill, not an open textarea.

Later notes in sequence:

- **RN-17: Can strangers recover meaning?**: the puzzle-conversation protocol that tests whether production and comprehension converge when two root-knowers communicate without shared rehearsal
- **RN-15: Compiling English into meaning**: the read path this note complements; translation output can now be manually re-typed via the same phoneme layer
- **RN-12: The campfire test (communication over correctness)**: the success metric practice scores are intended to support but have not yet been wired to

## Open Questions

The tooling answered "can learners type Fonora script at all?" with a qualified yes; the IME works, drills exist, and tests guard the compose layer. It left empirical and design gaps that motivate what follows:

- **Does typing skill transfer to communication?** Keyboard Testing uses nonsense phoneme words; Spelling Practice uses lab vocabulary. Neither tests whether a learner can compose a novel compound and be understood; the question RN-17's puzzle conversation was built to address.
- **Should production route through articulatory primitives instead of roman phonemes?** A grid-native keyboard (place key + manner key) would teach RN-01's composition model directly but would abandon QWERTY muscle memory. No experiment compared the two paths.
- **What score threshold counts as "literate enough" for the campfire test?** Practice modes report per-attempt correctness but define no passing bar, no spaced repetition, and no linkage to the ~50-root communicative core.
- **Fonoran roman spellings as an extra learning burden.** Spelling Practice prompts roman (`kaso`), not English or concept IDs. Whether that helps or hinders learners who arrive through the interpretive translator remains untested.

Reading, writing, translation, and typing were all in place by Jun 30. The natural next experiment, put two root-knowers together and see if they recover each other's meaning, is RN-17's Research Question.

## References

**Related commits**
- `0305077`: Replace Keyboard tab with visual QWERTY IME and roman-key composer (Jun 30, 2026)
- `7e3e0aa`: Responsive keyboard layout for small screens (Jun 30, 2026)
- `6c4a7c8`: Keyboard Testing, Spelling Practice, shared typing-practice flow, compose UX refinements (Jun 30, 2026)
- `1ad6139`: Split Script into Learn (`/learn`) and Tools (`/tools`) routes (Jun 30, 2026)
- `816a73e`: Fix Tools routing and Writing keyboard `isActive` after nav split (Jun 30, 2026)
- `63b79cf`: Initial primitive symbol keyboard and number-key shortcuts (Jun 20, 2026; superseded by `0305077`)

**Documentation:** [`docs/language-rules.md`](../language-rules.md) (phoneme inventory the keyboard encodes)

**Interactive demo:** [Spelling Practice](/learn#writing)

**Source:** [`js/fonora-keyboard-ui.js`](../js/fonora-keyboard-ui.js), [`js/fonora-keyboard-compose.js`](../js/fonora-keyboard-compose.js), [`js/fonora-keyboard-layout.js`](../js/fonora-keyboard-layout.js), [`js/fonora-spelling-practice.js`](../js/fonora-spelling-practice.js), [`js/fonora-typing-practice.js`](../js/fonora-typing-practice.js)

**Future research notes:** RN-17 (puzzle conversation / recoverable meaning)
