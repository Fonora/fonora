# Fonoran generator archive (historical)
> **Now a research note.** This document is preserved as a primary source. Related narrative in the research notebook: [RN-07 · Can words grow from a grid?](/research/notes/roots-from-grammar).


> **Archive.** Retired bulk generators. Active workflow: [fonoran.md](fonoran.md); direction set by the [Fonoran Constitution](fonoran-constitution.md).

> **Status:** archival reference only, code and data for Gen 1 and Gen 2 were removed during the lab-first cleanup.

## Overview

Fonoran went through several generations of **algorithmic vocabulary generation** before the current **sound-first lab** at `/language/` became the primary product. Earlier generations tried to produce hundreds or thousands of words from a small semantic core.

| Generation | Direction | Scale | Fate |
| --- | --- | --- | --- |
| **Gen 1** | Hand-authored roots → grammar vowels → families & compounds | ~175 roots → thousands of inflected forms | Removed (English-adjacent inventory) |
| **Gen 2** | Human primitives + articulation coordinates → roots + IE collision repair | ~40 primitives → full inventory JSON | Removed (superseded by Gen 3) |
| **Gen 3 / 3.1** | DDA coordinates → grid-native roots & derivations | Full primitive grid + compounds | **Kept**: expert tools, health scoring, lexicon seeds |
| **Primitive roots (2026)** | Ranked human primitives → Huffman-like syllable allocation | ~200 concept-first roots | **Superseded** — see [fonoran-semantic-foundation.md](fonoran-semantic-foundation.md) |
| **Lab (current)** | User builds syllables and compounds one-by-one | Your `fonoran-sound-bucket.json` | **Production** |

---

## Gen 1: hand-authored roots + grammar vowels

### Philosophy

- **Discoverable meaning:** related concepts share roots; grammatical role is visible in word shape.
- **One-syllable roots** in CV or CVC form (e.g. `dor`, `lum`, `wa`).
- **Grammar vowels** on the final segment assign word class:

| Vowel | Role | Example (`dor` = roundness) |
| --- | --- | --- |
| a | object / noun | dora = ball |
| e | action / verb | dore = rotate |
| i | descriptor | dori = round |
| o | abstract | doro = roundness |
| u | collective / system | doru = cycle |

### Data model

Two JSON files drove everything:

- **`fonoran-roots.json`**: ~175 roots in ten categories (shape, nature, motion, perception, body, society, object, time, space, number). Each entry: `{ meaning, category }` keyed by root spelling.
- **`fonoran-grammar.json`**: `grammar_vowels`, articulation symbolism, stored compounds, contractions, and worked examples.

### Word families

For root **R** with meaning **M**, the generator produced five inflected forms:

```
Ra = M as object    Re = M as action    Ri = M as quality
Ro = M as abstract  Ru = M as system
```

Example, `lum` (light): **luma** lamp, **lume** illuminate, **lumi** bright, **lumo** luminosity, **lumu** lighting system.

### Compounding

- Order: **general → specific** (modifier + head).
- Stored compound recipes in grammar JSON with glosses.
- Contractions for frequent pairs (e.g. `wafir` → `waf` for water-fire).

### UI tool

**`tools/fonoran-generator.html`** (removed) provided:

- Browse roots by category
- Generate word families from any root
- Build compounds from two roots
- View contractions
- Export vocabulary batch as CSV

### Known limitation

Roots were largely **English/Latin cognates** (`wa` = water, `ter` = earth, `man` = person, `lum` = light). Good for UI prototyping; poor for “language archaeology.”

### To revive Gen 1

1. Restore `data/fonoran-roots.json` and `data/fonoran-grammar.json` from git history (`feature/fonoran-language-experiment` or earlier commits).
2. Restore `tools/fonoran-generator.html`.
3. Family generation is trivial: for each root, concatenate root consonants + grammar vowel.
4. Compounds: join two roots per recipes in grammar JSON.

---

## Gen 2: coordinate-driven root machine

### Philosophy

Invert Gen 1: design the **machine that creates words**, not the words themselves.

- Primitives have **semantic coordinates** (domain, traits, `place_offset`) but **no phonological form**.
- Roots **emerge** from Fonora articulation grid positions (place 1–5, manner modifiers).
- **Collision analysis** against Indo-European reference lexicons (English, Latin, Greek, Germanic, Romance) quantifies accidental borrowing; high-collision roots get repaired via coordinate rotation.

### Data model

- **`fonoran-gen2-config.json`**: primitives, semantic frameworks (evaluated contact-geometry ontology), `depth_to_place`, manner mappings, collision thresholds.
- **`fonoran-gen2-roots.json`**: generated output (deterministic re-run from config).

### Algorithm (summary)

1. For each primitive, map semantic domain → base place + manner via selected framework (Framework C, contact geometry, was primary).
2. Apply `place_offset` and primitive hash for vowel/coda selection.
3. Build CVC syllable from grid coordinates.
4. Score against reference lexicons; if collision score exceeds threshold, rotate place/manner/vowel and retry.
5. Emit inventory with coordinates, gloss, collision metadata.

### CLI

```bash
npm run fonoran:gen2              # write data/fonoran-gen2-roots.json
node tools/fonoran-gen2.js --markdown
node tools/fonoran-gen2.js --json
```

### Known limitation

Still started from **human concepts** (water, person, light) assigned to coordinates. Collision repair reduced IE borrowing but did not eliminate concept-first design.

### To revive Gen 2

1. Restore `tools/fonoran-gen2.js`, `data/fonoran-gen2-config.json`, and generated roots from git history.
2. Add `"fonoran:gen2": "node tools/fonoran-gen2.js"` to `package.json`.
3. Edit primitives or frameworks in config; re-run for deterministic new inventory.

---

## Gen 3 / 3.1: grid-native (still in repo)

Gen 3 rebased entirely on **DDA coordinates** (Depth, Mode/Dynamics, Aspect). Human concepts appear only at the **derivation layer**, never as primitives.

- **Gen 3:** `tools/legacy/gen3/fonoran-gen3.js` → `data/fonoran-gen3-roots.json`
- **Gen 3.1:** readability repairs, distinctiveness, `tools/legacy/gen3/fonoran-gen3-1.js` → `data/fonoran-gen3-1-roots.json`
- **Canonical stabilization:** human-approved roots → `data/fonoran-canonical-registry.json`
- **Expert UIs (retired):** Gen 3 review and canonical review HTML pages were removed; use live tooling at `/language/` (Language Explorer, Health, Advanced → archive DDA experiment).

Full design docs (still present):

- [fonoran-gen3.md](fonoran-gen3.md)
- [fonoran-gen3-1.md](fonoran-gen3-1.md)

Gen 3 JSON is **reference data** for DDA inference and the English meaning picker, not the live dictionary. Audits and constitution exports go to `reports/` (gitignored). The lab bucket is authoritative for the language you are building.

---

## Primitive roots experiment (2026) — superseded

> **Retired.** The algorithmic primitive-roots pipeline (`fonoran-primitive-roots.js`) assigned phonetics before semantic approval. The new semantic-first foundation is documented in [fonoran-semantic-foundation.md](fonoran-semantic-foundation.md).

Legacy files remain for reference only:

| File | Role |
| --- | --- |
| [`data/fonoran-primitive-roots-config.json`](../data/fonoran-primitive-roots-config.json) | Old concept list |
| [`tools/legacy/fonoran-primitive-roots.js`](../tools/legacy/fonoran-primitive-roots.js) | Old generator (do not use for canonical work) |
| [`data/fonoran-primitive-roots.json`](../data/fonoran-primitive-roots.json) | Old output |

---

## Story mode & registry vocabulary (removed experiments)

Two API-only experiments never shipped in UI:

- **Registry vocabulary** (`/api/fonoran/vocabulary`), flat dictionary from canonical registry + gen3.1 derivations + stress-test concepts.
- **Story mode** (`/api/fonoran/stories`, `/api/fonoran/feedback`), resolve passage tokens against that vocabulary; collect like/dislike feedback.

These were removed during cleanup. Passage/feedback JSON lived in `data/fonoran-story-*.json`.

---

## Current production model (lab-first)

`/language/` stores your language in **`data/fonoran-sound-bucket.json`**:

- **Sounds**: user-created syllables with optional English meanings and review state.
- **Compounds**: concatenations of approved sounds with meanings.
- **Review workflow**: `draft → needs_review → approved | rejected | revised`, with undo.

The English picker loads **`fonoran-english-lexicon.json`** (auto-built from gen3.1 primitive glosses + stress-test concept words). It suggests English glosses only; it does not assign Fonoran forms.

See [fonoran.md](fonoran.md) for the current app guide.

---

## Git recovery

Gen 1 and Gen 2 files can be recovered from branch history:

```bash
git log --oneline -- data/fonoran-roots.json tools/fonoran-gen2.js
git show <commit>:data/fonoran-roots.json
```

Search commits on `feature/fonoran-language-experiment` before the lab-first cleanup.
