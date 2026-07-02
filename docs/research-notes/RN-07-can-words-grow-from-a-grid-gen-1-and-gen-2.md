# Can words grow from a grid? (Gen 1 and Gen 2)

## Research Question

Phase I established that Fonora could *write* sounds: the articulatory grid (RN-01), an IPA pipeline that bypasses spelling (RN-02), vowel grammar (RN-03, RN-04), multilingual encoding with scoped English overlays (RN-05), and a collision audit that could enumerate symbol hazards before trusting the script at scale (RN-06). By late June 2026 the script side had enough machinery to transliterate text from several languages onto the same compositional inventory.

That left a different problem. A script is not a language. [RN-05](/research/notes/multilingual-script) closed by asking what should sit *on top* of a grid that could now represent sounds from multiple source languages, and whether vocabulary could be *generated* rather than borrowed word by word from English or Latin.

The question this note addresses is the Phase II pivot those script notes deferred:

**Could Fonora carry a language whose vocabulary was systematic and discoverable — words that belong to visible families — rather than a pile of memorized, unrelated forms?**

Gen 1 and Gen 2 were the first two attempts to answer that question. Both tried to *grow* words from a small semantic core instead of importing a full dictionary. Both were complete enough to seed an early Dictionary UI and then archived when a third generation shipped the same week.

## Hypothesis

Two related hypotheses were tested in sequence.

**Gen 1:** A one-syllable CV or CVC root plus a grammar-vowel suffix yields a whole word family. From root `lum` (light), inflect with final vowels to produce **luma** (lamp, object), **lume** (illuminate, action), **lumi** (bright, quality), **lumo** (luminosity, abstract), and **lumu** (lighting system, collective). The vowel is not decorative; it assigns grammatical role. Related concepts share a consonant skeleton; the shape of the word tells you which member of the family you are looking at.

**Gen 2:** Invert the hand-authoring step. Primitives carry semantic coordinates (domain, traits, `place_offset`) but **no fixed phonological form** until generation. Map each concept onto Fonora articulation-grid positions (place 1–5, manner modifiers), build a CVC syllable from those coordinates, then score the result against Indo-European reference lexicons (English, Latin, Greek, Germanic, Romance). When collision score exceeds a threshold, rotate place, manner, or vowel and retry. The hypothesis was that a *machine* could create roots without accidentally cloning familiar European words, or at least could quantify and repair the worst collisions.

Both approaches assumed a **concept-first** direction: pick a meaning (water, person, light), then assign or derive a sound. English and Latin cognates were tolerated in Gen 1 for rapid prototyping; Gen 2 added explicit collision repair but still started from human concept lists.

## Approach

### Gen 1: hand roots and grammar vowels

Gen 1 was documented retrospectively in [`docs/fonoran-generator-archive.md`](../fonoran-generator-archive.md), added in commit `14d5d84` (Jun 24, 2026). By then, Gen 1 code and data had already been removed during a lab-first cleanup; the document preserves the design from work that predates the first committed Fonoran toolchain snapshot in this repository.

The data model was two JSON files:

- **`fonoran-roots.json`**: approximately 175 roots in ten categories (shape, nature, motion, perception, body, society, object, time, space, number). Each entry stored `{ meaning, category }` keyed by root spelling.
- **`fonoran-grammar.json`**: `grammar_vowels`, articulation symbolism, stored compound recipes, contractions, and worked examples.

Family generation was deliberately trivial: for root **R** with meaning **M**, concatenate **R + vowel** for each grammar role:

```
Ra = M as object    Re = M as action    Ri = M as quality
Ro = M as abstract  Ru = M as system
```

Compounding followed **general → specific** order (modifier + head), with stored recipes and contractions (e.g. `wafir` → `waf` for water-fire). A removed UI, **`tools/fonoran-generator.html`**, exposed browse-by-category, family generation, compounding, and CSV export, output seeded the early [Dictionary](/language#dictionary).

The grammar-vowel table was the core mechanism:

| Vowel | Role | Example (`dor` = roundness) |
| --- | --- | --- |
| a | object / noun | dora = ball |
| e | action / verb | dore = rotate |
| i | descriptor | dori = round |
| o | abstract | doro = roundness |
| u | collective / system | doru = cycle |

### Gen 2: coordinate-driven root machine

Gen 2 kept the concept-first starting point but tried to automate phonology. Primitives in **`fonoran-gen2-config.json`** had semantic coordinates but no phonological form. A CLI generator (**`tools/fonoran-gen2.js`**, removed) wrote **`fonoran-gen2-roots.json`** deterministically from config.

The algorithm, as archived:

1. Map semantic domain → base place + manner via a selected framework (Framework C, contact geometry, was primary).
2. Apply `place_offset` and a primitive hash for vowel/coda selection.
3. Build a CVC syllable from grid coordinates.
4. Score against reference lexicons; if collision score exceeds threshold, rotate place/manner/vowel and retry.
5. Emit inventory with coordinates, gloss, and collision metadata.

Approximately forty human primitives expanded to a full inventory JSON via `npm run fonoran:gen2` (removed). Gen 2 reused the Phase I articulation grid, coordinates were grid positions, not arbitrary tags, so roots were meant to *sound like* they belonged to the script underneath.

### What shipped on Jun 24 instead

The same day the archive was written, commit `5b6bc58` landed Gen 3 tooling (`tools/fonoran-gen3.js`, config and roots JSON, derivation helpers, DDA inference) and commit `d2e6315` shipped the language builder web app at `/fonoran/`. Gen 1 and Gen 2 were already gone from the tree; Gen 3 replaced them as the experimental vocabulary layer. [`docs/fonoran-gen3.md`](../fonoran-gen3.md) (same documentation pass) states plainly that all prior Fonoran work (Gen 1 inventory, Gen 2 primitives, English-adjacent roots, is **disposable** relative to the grid-native rebase documented in RN-08.

## Evaluation

There was no formal user study, memorability battery, or cross-linguistic comprehension test for either generation. Evaluation was informal and tool-driven:

- **Gen 1:** Did the family pattern produce readable demo vocabulary? Could the generator UI browse categories, emit five inflected forms per root, and export batches? Did compounds from stored recipes parse intuitively in the Dictionary?
- **Gen 2:** Did coordinate mapping produce distinct roots for ~40 primitives? Did collision scoring and rotation reduce Indo-European look-alikes compared to Gen 1's hand list? Was output deterministic (re-run from config → same JSON)?
- **Cross-generation:** Did either approach feel like "language archaeology": words that could plausibly have grown from the grid, or like English with a phonetic skin?

The archive doc records the honest assessment at retirement time: Gen 1 roots were largely English/Latin cognates (`wa` = water, `ter` = earth, `man` = person, `lum` = light). Good for UI prototyping; poor for the archaeology goal. Gen 2's collision repair reduced accidental borrowing but did not eliminate concept-first design; you still began with *water* and *person*, not with unnamed grid coordinates.

A later retrospective ([`docs/fonoran-primitive-roots-report.md`](../fonoran-primitive-roots-report.md), RN-10) rated Gen 1 **No — violates invariant-word grammar** and Gen 2 **No — concept-first, not grid-native**; a failure mode already visible when inflection vowels were compared to [`docs/fonoran-grammar.md`](../fonoran-grammar.md)'s invariant-concept model.

## Findings

**Gen 1's word families worked as a demo mechanic.** The five-vowel inflection pattern produced tidy, browsable families. Compounding and contractions gave the Dictionary something to show beyond bare roots. For teaching the *idea* that related words could share a skeleton, Gen 1 was sufficient.

**Gen 1's roots were too English-adjacent for the stated goal.** When `wa` means water and `man` means person, the vocabulary reads as familiar stems with a suffix rule pasted on, not as a language that grew from Fonora's grid. The archive labels this explicitly as a known limitation, not a surprise discovered later.

**Gen 1's grammar vowels conflicted with Fonoran's later invariant-word principle.** Inflecting `lum` → `luma` / `lume` / … encodes word class in the final vowel. Fonoran grammar (as it stabilized) treats every lexical item as an **invariant concept**; role comes from grammar particles and sentence position, not from morphological vowel alternation. Gen 1's mechanism was incompatible with that direction even before the constitution formalized it.

**Gen 2's collision repair was real but insufficient.** Rotating coordinates when Indo-European collision score exceeded threshold did reduce look-alike roots. It did not change the upstream assumption: human concepts assigned to coordinates, then realized as sounds. Collision repair is a hygiene layer, not a semantic foundation.

**Both generations were concept-first.** Gen 1: concept → word. Gen 2: concept → coordinates → word. Neither asked what meaning *emerges* from the articulation grid when you start with no English label for "water." That inversion became the explicit next step.

Both generators were archived. Their files are not present in this repository's git history (including the `feature/fonoran-language-experiment` branch named in recovery instructions); only the archive document and Gen 3's retrospective comparison survive as primary sources.

## What Changed

Gen 1 and Gen 2 did not survive into the current production model. The lab-first workflow at `/language/` ([`docs/fonoran.md`](../docs/fonoran.md)) stores user-built syllables in `data/fonoran-sound-bucket.json`; bulk algorithmic generators are reference-only.

What persisted: the intuition that related meanings should share structure (now as invariant-root **compounds**, not vowel paradigms); Gen 2's grid-linked phonology (foreshadowing RN-08's DDA manifold); and collision/distinctiveness hygiene (RN-06 at the script layer, RN-09 at the phonetic layer).

What was explicitly superseded:

- Grammar-vowel inflection (a/e/i/o/u roles on final segments).
- Hand-authored cognate roots as the primary inventory source.
- Concept-first bulk generation as the authoritative lexicon.

Later notes in sequence:

- **RN-08: Meaning from coordinates: the Gen 3 DDA experiment** (invert to grid-native semantics; human concepts only at the derivation layer)
- **RN-09: Making invented words memorable (Gen 3.1)** (distinctiveness layer over unchanged DDA coordinates)
- **RN-10: Optimal sounds, wrong premise** (200-primitive Huffman-like allocation; still concept-first, still superseded)
- **RN-12: The campfire test** (constitution and communication-first metric that ultimately demoted all bulk generators)

[`docs/fonoran-gen3.md`](../fonoran-gen3.md) §8.1 still listed "grammar-vowel inflection (from Gen 1 mechanism, reconnected to Gen 3 roots)" as a research backlog item at Gen 3 launch. That reconnection never shipped; the constitution and grammar spec moved role-marking to invariant particles instead.

## Open Questions

Gen 1 and Gen 2 answered "can we generate vocabulary systematically?" with a qualified yes for demos and a no for grid-native language archaeology. They left a sharper question on the table:

**What if we inverted the whole pipeline, and let meaning emerge from the articulation grid instead of being assigned to it?**

If there is no prior word for *water*, no English concept list to seed primitives, what kinds of meaning naturally occupy stable coordinates on the Fonora map? Can familiar concepts like *river* appear only as **derivations** from grid-native pieces, never as primitives?

That question became **RN-08**. A secondary thread, whether phonetic distinctiveness could be improved without moving semantic coordinates, became **RN-09**. Whether optimal syllable allocation could fix a concept-first inventory became **RN-10**.

## References

**Related commits**
- `14d5d84`: Document platform layers, Fonoran guides, and deployment options; first committed [`docs/fonoran-generator-archive.md`](../fonoran-generator-archive.md) chronicling Gen 1 and Gen 2
- `5b6bc58`: Add Fonoran language tools, API, and PostgreSQL-backed storage (Gen 3 toolchain; Gen 1/2 already removed)
- `d2e6315`: Add Fonoran language builder web app at `/fonoran/`
- `07591f8`: Merge `feature/fonoran-language-experiment` into staging
- `5cfe28a`: Reorient Fonoran around the communication experiment; demote Gen 3/DDA track; add constitution (later supersession of all bulk-generator framing)

**Documentation:** [`docs/fonoran-generator-archive.md`](../fonoran-generator-archive.md), [`docs/fonoran-gen3.md`](../fonoran-gen3.md) (§0 rebasing, §8 scale notes), [`docs/fonoran-primitive-roots-report.md`](../fonoran-primitive-roots-report.md) (prior-generator evaluation table)

**Interactive demo:** [Dictionary](/language#dictionary) (early consumer of generated inventory; current lab bucket is authoritative)

**Future research notes:** RN-08 (Gen 3 DDA coordinates), RN-09 (Gen 3.1 distinctiveness), RN-10 (Huffman-like primitive roots), RN-12 (campfire test / constitution)
