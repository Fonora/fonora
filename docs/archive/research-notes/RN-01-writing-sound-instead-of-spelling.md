---
status: Foundational
date: 2026-06-20
phase: phase-1
---

# Writing sound instead of spelling

## Research Question

Can a writing system encode *how* a sound is physically produced, where in the vocal tract it is made and how the airstream is shaped, instead of encoding a word's historical spelling?

This matters because almost every writing system in common use is a record of etymology, not articulation. English `c` can be /k/ or /s/ depending on the accident of borrowing; `gh` is silent in "night" and a fricative in Scots "loch." Learners memorize thousands of spelling-to-sound exceptions because the *shape* of a Latin letter carries no information about where the tongue or lips go; the letter is a historical artifact, and pronunciation is reconstructed from it only through years of exposure.

Fonora's starting premise, from the very first commit ("Fonora phonetic symbol research tool," Jun 20, 2026), was to ask whether a symbol could carry articulatory information directly, so that seeing it tells you something true about the mouth rather than about centuries-old orthography.

## Hypothesis

The working hypothesis: speech could be described as a small, composable grid rather than an open-ended alphabet. If **place of articulation** (lips, front tongue, middle tongue, back tongue, throat) and **manner of articulation** (plain, voiced, frictive, nasal, approximant) are treated as independent axes, a consonant is just a coordinate, and its symbol can be *assembled* from a place glyph plus a manner glyph rather than memorized. A separate marker could reuse the same primitives to build vowels, keeping the whole system compact.

This was documented as a hypothesis, not a settled design; the original `language-rules.md` marks the vowel table and several derived sounds as "experimental," "draft," or "provisional," and states plainly that undefined grid cells are "intentional research gaps." Nothing in the record claims this approach was proven; only that it was worth building enough to find out whether pronunciation could become more intuitive than rote memorization.

## Approach

Articulation was chosen as the foundation because it's true across languages independent of any writing tradition, /p/ is made with the lips whether spelled with Latin *p*, Cyrillic п, or Japanese ぱ. That mattered directly once Fonora had to handle Spanish, French, German, Japanese, Arabic, and Mandarin later on.

The composition idea was concrete from the start: a **manner** glyph plus a **place** glyph produces a consonant, written tightly with no space (`modifier + place`, e.g. voiced lips = ⌔○). The initial grid defined 5 places × 4 manners plus a plain row, 9 core primitives generating up to 25 consonant cells, most filled immediately, some deliberately left open.

Fonora intentionally avoided adapting the Latin alphabet. The nine primitives were abstract geometric glyphs (○, ∩, ⌒, ∪, ⊐ for places; ⌔, ⌕, ⌙, ⌓ for manners), not modified Latin letters, reusing Latin shapes would have carried the very baggage the project was trying to escape: a reader's existing letter-to-sound associations from their native spelling system.

Two early design principles show up directly in the source: undefined cells are gaps, not errors, and the system shouldn't invent symbols to fill them; and composed symbols should render as one visual unit, since the point was for a *shape* to be legible as a sound rather than a sequence of separate marks. The throat row illustrates both; it had no defined standalone consonant initially, and was repurposed instead for constructing vowels (throat symbol + place symbol) rather than force-filled.

## Evaluation

There was no formal user study at this stage: one developer testing an idea against answerable questions, using tools that shipped in the same first commit: a symbol keyboard, a live decode panel, a reverse sound-to-symbol lookup, and a decode/construct quiz.

The prototype was built to answer questions like:

**Coverage** does the grid reach every consonant category that mattered yet? Twenty of twenty-five cells were filled immediately; the remaining five (all throat) were marked open rather than forced.

**Inferability** can a symbol's place+manner parts be decomposed back into the sound without memorizing the word first? The decode quiz and reverse lookup exercised this in both directions. **Visual consistency**: does a composed symbol read as one unit? This produced an explicit tight-rendering rule.

**Compactness** does composition stay small as sounds are added? The vowel experiment states directly that "all vowel representations should remain two symbols long," prioritizing fixed length over phonetic completeness.

## Findings

The articulatory grid held up as a foundation. Composing manner + place reliably produced legible, distinct consonants for stops, fricatives, nasals, and approximants across the four non-throat places, usable enough to build the rest of the app on.

Limitations were documented alongside successes, not discovered later. The throat column couldn't hold a full parallel consonant set and was left with open gaps from day one. The vowel system was the weakest part and was labeled as such throughout, vowels reused the throat symbol as a marker plus a place glyph, long and short vowels were deliberately collapsed ("long vowels are not currently distinguished"), and the section carried a disclaimer that it existed to test readability, not phonetic precision.

Simplicity was chosen over completeness explicitly, not accidentally. It was also already clear in the first commit that a pure spelling-to-symbol path (the "Legacy Encoder") was a dead end beyond comparison; the same commit already treated a phonetic pipeline as preferred. That realization became the seed of the next research note.

## What Changed

The core composition principle survived intact: current encoding rules still describe five places and four manner modifiers composing at load time as `modifier + place`, generated from a single markdown source of truth; the same idea present in the original file.

What evolved is mostly at the edges the first version flagged as unfinished. The vowel marker was originally the throat consonant symbol doing double duty; it's since become a dedicated vowel indicator (⚬), removing the ambiguity between "throat as place" and "throat as vowel prefix." Three of the five original throat-column gaps (plain, voiced, fricative) were later filled with real glottal/velar-fricative/uvular-fricative sounds. Throat nasal (**⏌⊃**) remains reserved — no attested glottal nasal. Throat approximant (**ᵔ⊃**) is documented as a research candidate for voiced pharyngeal approximant `/ʕ/` but has no encoder key yet.

Later notes trace what this foundation made possible: RN-02: Teaching the machine to hear · RN-03: How few vowels can English tolerate? · RN-04: Vowels as grammar: the v3 rebuild · RN-06: Hunting ambiguity in the script.

## Open Questions

- How should arbitrary text be reliably mapped onto this grid, given spelling isn't a trustworthy guide to pronunciation?
- Can the two-symbol vowel constraint survive languages with more vowel qualities than the grid has marker slots, without producing homographs?
- Should the throat column's remaining gaps ever be filled, or are they more honest left open?
- Is collapsing long/short vowels acceptable once real words are tested at scale, or does it lose meaning that matters?

## References

- Related commits: `63b79cf`: initial commit

**Documentation:** `docs/language-rules.md` (current v3), original `language-rules.md`/`encoder-rules.md`

**Interactive demo:** Sound Grid (`/#grid`), Alphabet (`/#alphabet`)

**Future research notes:** RN-02, RN-03, RN-04, RN-06
