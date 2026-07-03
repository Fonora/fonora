---
status: Active
date: 2026-07-03
phase: phase-5
---

# Concept-first translation and honest gaps

## Research Question

[RN-15](/research/notes/compiling-english-into-meaning) established the
interpretive translator: English compiles into Fonoran *meaning* instead of
being glossed word for word. But that first architecture still treated **English
as the source of truth** and was engineered to *always emit a word*. Its
resolution cascade ended in two guessing tiers — a WordNet synonym/hypernym
lookup and a "nearest existing concept" fallback — plus it let **weak**
(description/gloss-derived) aliases surface as final output.

The failure this note starts from is `behind → ja`. `behind` has no curated
alias, so it fell to the WordNet tier. `expandWord` flattened *every* word-sense
together, including the noun sense of `behind` = *buttocks*, whose synonym pool
contains `can`; the alias index maps `can → metal → ja`. No word-sense
disambiguation, no part-of-speech check against the slot role, no confidence
floor. The bad guess was then frozen in the semantic cache.

`behind → ja` is not a one-off bug. It is the signature of a structural choice:

**Can the translator be reoriented so that Fonoran concepts are the source of
truth — resolving English through a scored, deterministic cascade that surfaces
low-confidence matches as honest gaps instead of fabricated words, while WordNet
is demoted from a runtime guesser to an offline curation assistant?**

## Hypothesis

The working hypothesis had five parts:

1. A **language-neutral semantic frame** should sit between the parse and the
   surface as a real object — every filled role carrying a `concept_id` +
   provenance, every unresolved element a first-class gap — implementing grammar
   Rule 7's "semantic frame" rather than leaving it aspirational.
2. The resolution cascade should be an **ordered, scored resolver with a hard
   confidence floor**: high-confidence curated aliases/concept ids, medium
   deliberate interpretations (rules, hints, transparent assembly), and *nothing
   below that*.
3. Removing the **WordNet synonym/hypernym tiers and the nearest-concept guess**
   from the runtime should kill the entire fabrication class (`behind → ja`,
   `flower → person`, `store → memory`, `high → fast`) without collapsing
   coverage — because most real vocabulary already resolves through curated
   aliases.
4. WordNet still has value, but **offline**: with part-of-speech filtering
   matched to the slot role (WSD) it becomes a *suggestion engine* for a human
   curator, never authoritative output. A preposition in a path role yields no
   usable verb/noun sense → honest gap → suggestion queue, not `ja`.
5. A **gap baseline** should turn honest gaps from a liability into a measurable
   growth backbone: the strict runner fails on *new* gaps, and the baseline can
   only shrink as roots are grown.

## Approach

The change touched the resolver, the translator, the lexicon, and the regression
harness. Determinism and the offline core were preserved throughout (no runtime
network calls).

**Semantic frame.** `translateEnglish` in
[`tools/fonoran-translator.js`](../../tools/fonoran-translator.js) now builds an
explicit frame from the resolved tokens:
`{ actor, action, target, place, time, modifiers, particles, gaps[] }`. Filled
roles reference a `concept_id` plus `resolution_kind`/`confidence`; unresolved
elements become `{ role, english, reason }` gaps. The surface is generated from
the same resolved tokens, so the frame never disagrees with what is actually
said.

**Scored resolver.** `resolveEnglishToken` in
[`tools/fonoran-english-resolve.js`](../../tools/fonoran-english-resolve.js) was
rewritten as ordered tiers with a confidence floor:

- **HIGH (`direct`)** — curated strong alias, concept id, lemma, or phrase.
- **MEDIUM (`interpreted`)** — curated concept hint/bridge (`reason → think`,
  `from → source`), curated interpretation rule (`spatial_path`, `classes`,
  idioms), irregular past, head-noun of a phrase, and transparent compound
  assembly *over strong aliases only*.
- **Below floor** — honest gap. A demoted weak (gloss) alias is carried as a
  non-authoritative `suggestion` but never emitted.

The WordNet synonym + hypernym block and the nearest-concept guess were deleted
from the runtime. Naive agentive `-er/-or/-ist` stripping was also removed: it is
a fabrication engine without POS (`flower → flow`, `power → pow`); genuine
agentive nouns (`healer`, `traveler`) are curated aliases instead.

**Offline WordNet assistant.**
[`tools/fonoran-semantic-lookup.js`](../../tools/fonoran-semantic-lookup.js)'s
`expandWord` now takes the slot role, filters WordNet synsets to the matching
part(s) of speech, and ranks by sense frequency. `suggestGapConcepts` maps those
POS-filtered candidates onto existing roots. The gap report attaches these
suggestions for human review; nothing enters the lexicon without approval.

**Curated backfill + relational set.** High-value words that used to be
fabricated were curated honestly into
[`data/localizations/en.json`](../../data/localizations/en.json)
(`flower → plant`, `house/store/market → place`, `king → person`,
`guard → hold`, `bring → take`, `year → time`, `toy → thing`, `wide → big`,
`high → up`, `young → child`, `doorway → door`). `beside → near` was added as a
curated spatial rule; `behind`, `front`, and `between` have no Fonoran root and
remain **tracked honest gaps**.

**Gap baseline.**
[`data/fonoran-translation-gap-baseline.json`](../../data/fonoran-translation-gap-baseline.json)
records the accepted honest gaps. `scripts/fonoran-translation-gaps.js --assert`
now fails on any new gap beyond it; `--update-golden` refreshes it;
`--update-gap-baseline` accepts a new set deliberately.

## Evaluation

- **Golden corpus** (`npm run test:translator`) — 129/129 phrases, regenerated
  with `--update-golden`. Ten phrases drifted, all improvements: fabrications
  became correct curated concepts (`flower → tet/plant` not `ba/person`,
  `store → che/place` not `memory`, `high → ra/up` not `nek/fast`) or honest
  gaps (`ready`, `ruled`).
- **Probe corpus** — 24/26 frame checks, 24 committed pass, 0 regressions.
- **Unit suite** (`node js/tests.js`) — 140/140, including new assertions that
  `behind` is an honest gap (not `ja`), that the frame carries `concept_id` +
  provenance, and that no runtime token resolves via the `semantic` or
  `alias_weak` tiers.
- **Quality mix** moved from 106 pass / 15 review / 8 gap to **120 pass / 0
  review / 9 gap** tokens: the "review" (soft/weak/WordNet) tier is gone — every
  resolved token is now a confident curated or deliberate hit.

## Findings

Removing the guessing tiers did **not** collapse coverage. The vast majority of
real vocabulary already resolved through curated aliases and rules; the WordNet
tiers were mostly manufacturing plausible-looking mistakes for the long tail.
Deleting them exposed a small, honest set of genuine gaps (`ready`, `ruled`,
`teaches`, `laughed`, `alone`, `when`, …) — exactly the signal the language needs
to grow deliberately.

The `behind → ja` chain confirmed the diagnosis: the fabrication was not a bad
synonym table but the *absence of word-sense disambiguation*. Once WordNet is
POS-filtered and offline, a preposition simply produces no usable candidate and
becomes a gap. Honesty and correctness turned out to be the same fix.

The semantic frame, once made concrete, also made the whole system easier to
reason about: gaps are first-class, provenance is inspectable, and the surface is
provably a function of the frame.

## What Changed

- Added a real semantic-frame pivot object to `translateEnglish`.
- Rewrote `resolveEnglishToken` as a scored cascade with a hard confidence
  floor; deleted the runtime WordNet synonym/hypernym tiers, the nearest-concept
  guess, and naive agentive stripping.
- Weak (gloss-derived) aliases no longer surface; they become honest gaps that
  carry a curation `suggestion`.
- Repurposed `expandWord` into a POS-aware (WSD) **offline** assistant and added
  `suggestGapConcepts`, surfaced in the gap report.
- Backfilled curated `english → concept` aliases and a small curated relational
  set (`beside → near`); left `behind`/`front`/`between` as tracked gaps.
- Introduced the gap baseline as the growth backbone; wired `--assert`,
  `--update-golden`, and `--update-gap-baseline`.
- Updated grammar [Rule 7](../fonoran-grammar.md) to describe the concept-first
  architecture and the honest-gap cascade.

## Addendum — Locative predicates (the "cat behind tree" failure)

Concept-first resolution fixed *fabrication*, but a live test exposed a second,
orthogonal failure: **the parser silently dropped meaning before resolution ever
ran**. `the cat is behind the tree` came back as "cat tree" — grammatically the
be-construction parser collapsed the predicate `behind the tree` to its head noun
(`tree`) and discarded `behind` entirely. Even a perfect lexicon can't help a
relation the parser never emits a token for.

Fix: make the parser **honest about position, not just vocabulary**. In a static
locative predicate the leading spatial preposition is routed into the **Place**
slot rather than head-noun-reduced:

- Relations with a concept resolve there — `above → up`, `under → down`,
  `beside → near` — so `the bird is above the tree → kal ra tet`.
- Concept-less relations become an honest Place gap — `the cat is behind the tree
  → kal [behind] tet`, with frame gap `{role: 'path', english: 'behind'}`.

Two ordering bugs surfaced while wiring this: `beConstructionFromParts` had to
route the locative *before* its participle heuristic (`looksLikeParticiple('between')`
was true), and the concept-less set (`LOCATIVE_GAP_PREPS`) is checked after the
`spatial_path` concepts so relations that *do* have a root take the resolved path.
The gap is now visible and tracked instead of invisible — the language can grow a
`behind` root deliberately, and until then the translation tells the truth about
what it cannot yet say.

## Open Questions

- `behind`, `front`, and `between` need real relational roots. Should they be a
  small dedicated relational domain, or compose from existing spatial concepts?
- Agentive nouns are curated one by one. Is a POS-gated, human-confirmed agentive
  rule worth reintroducing, or is curation the right long-term cost?
- The offline assistant proposes single-root mappings only. When should it be
  allowed to propose *compounds* (e.g. `traveler → move + person`) for review?
- Should the gap baseline feed a prioritized root-growth queue (frequency-ranked
  gaps → next roots to mint)?

## References

- [RN-15 · Compiling English into meaning](/research/notes/compiling-english-into-meaning)
- [RN-24 · Grammar under the Constitution](/research/notes/grammar-under-the-constitution)
- [docs/fonoran-grammar.md — Rule 7](../fonoran-grammar.md)
- [tools/fonoran-english-resolve.js](../../tools/fonoran-english-resolve.js),
  [tools/fonoran-translator.js](../../tools/fonoran-translator.js),
  [tools/fonoran-semantic-lookup.js](../../tools/fonoran-semantic-lookup.js)
