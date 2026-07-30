---
status: Open
date: 2026-07-20
phase: phase-5
---

# CV density and CVC audibility (thought experiment)

## Research Question

After clearing Health Learnability to 100 by respelling four short CV roots that prefixed CVC siblings (`da`/`fe`/`ga`/`ge` → `du`/`fa`/`wo`/`su`), two worries remain:

1. **Prefix-family exclusivity can feel arbitrary.** Blocking `da` because `dak` (hand) exists is structural, not a judgment that "sick" is a bad concept, yet an editor hunting for an intuitive short spelling can experience it as a ban.
2. **The language may be too dense with open CV syllables**, especially in the high-frequency core. Closed CVC roots might be more audible and comprehensible in compounds, even if they are slightly harder to produce.

This note documents an honest projection. **No lexicon rewrite.** Seeds are unchanged.

**Is Fonoran over-densified with CV in the places that matter for campfire speech, and would preferring CVC for future (or some current) primitives improve audible comprehension without wrecking compoundability?**

## Hypothesis

Three claims that must be separated separately:

| Claim | About | Prediction |
| --- | --- | --- |
| A. Production ease | Single-root articulation | CV is easier than CVC ([RN-32](/research/notes/fonoran-phonetic-constitution) ease ×0.62 for coda) |
| B. Join audibility | Roots spoken back-to-back | CVC+CV joins are favored; identical-consonant joins are hard-rejected (RN-32) |
| C. Prefix / segmentation | Inventory as a set | A CV and any `CV*` longer root cannot both exist without `prefix_overlap` |

The working hypothesis for this exploration: **global CV share is not the main problem; assigner policy packing essentials into CV is.** That densifies the highest-frequency layer, raises prefix pressure against the CVC compound layer, and makes exclusivity feel arbitrary when an intuitive CV is blocked by an unrelated family.

A CVC-heavier *new-root* policy could improve B and C while accepting some cost on A and on compound length, if free CVC headroom exists or can be created without a mass reshuffle.

## Approach

Read-only metrics and counterfactuals via:

```bash
npm run fonoran:cv-density:project
```

Artifact: [`data/fonoran-cv-density-projection.json`](../../data/fonoran-cv-density-projection.json).

Related machinery already in tree:

- Assigner CV preference: [`tools/fonoran-root-sound-assign.js`](../../tools/fonoran-root-sound-assign.js) `tierGate` (priority ≥92nd percentile → CVC penalty 4000)
- Prefix exclusivity inventory: [`docs/fonoran-prefix-safe-roots.md`](../fonoran-prefix-safe-roots.md), `npm run fonoran:prefix-safe`
- Join / ease rules: [RN-32](/research/notes/fonoran-phonetic-constitution)

No Word Manager gate change and no seed edits in this note.

## Evaluation

Baseline (2026-07-20, post Package A respells):

| Layer | CV | CVC | CV% |
| --- | ---: | ---: | ---: |
| All approved roots (135) | 57 | 78 | **42%** |
| Priority `essential` | **25** | **0** | **100%** |
| Priority `common` | 27 | 66 | 29% |
| Ring 1 campfire (50) | 23 | 27 | 46% |
| Ring 2 (50) | 21 | 29 | 42% |
| Ring 3 (35) | 13 | 22 | 37% |
| Preferred compound *parts* | 418 | 544 | 43.5% |

2-root join patterns (preferred compositions):

| Pattern | Count |
| --- | ---: |
| CVC+CVC | 130 |
| CV+CVC | 99 |
| CVC+CV | 94 |
| CV+CV | 58 |

Mean compound length from concatenated root spellings ≈ 5.7 characters. Health from seeds: Learnability **100**, `prefix_overlap` **0**.

Prefix-safe generator pool (vs current taken set):

| Free pool slot | Count |
| --- | ---: |
| CV prefix-safe | **0** |
| CV blocked by existing CVC families | 12 |
| CVC prefix-safe | **6** (`fek gas gel kak mat tan`) |
| CVC blocked by existing CV | 30 |

### Counterfactual A: relax essential→CV gate

If essentials could move onto today's free prefix-safe CVCs without other changes:

- 25 essential CVs vs **6** free safe CVCs → only **6** could move today.
- Remaining 19 need newly invented CVCs or family reshuffles (freeing a CV by moving its CVC siblings, or vice versa).

### Counterfactual B: Ring-1 CV budget of 12

If Ring 1 reserved CV for a small closed set (~particles / deixis scale) and the rest went CVC:

- Ring 1 has **23** CV today → **11** would need CVC alternatives.
- Those 11 roots appear in ~135 compound-part occurrences → roughly **+135 characters** across preferred compounds if each gains one coda (order-of-magnitude length cost, not a build).

### Exclusivity ≠ semantic ban

Example from the free-pool view: wanting a short CV like `da` is blocked while `dak`/`dal`/`dan`… exist. That is **prefix-family exclusivity** (segmentation safety), not "sick is banned." The editor chooses which member of the family occupies the slot: CV *or* the CVC cluster, not both.

## Findings

1. **The lexicon is already CVC-leaning (58%), but the essential layer is CV-locked (100%).** Density anxiety tracks the assigner policy more than the aggregate mix. Compounds already prefer CVC+CVC and mixed joins over CV+CV.

2. **Prefix exclusivity is load-bearing and can feel arbitrary.** After Package A it is clean (Learnability 100). It should be framed as a **slot conflict** ("pick CV or this CVC family") rather than a mysterious ban. Compoundability still wins: exclusivity exists so stacked roots stay hearable.

3. **A hard pivot to "everything CVC" is not free headroom.** Only six prefix-safe CVCs are free in the generator pool. Moving essentials or Ring-1 excess requires inventing forms or reshuffling families: a real editorial project, not a config flip.

4. **RN-32 tension remains:** CVC helps join audibility and segmentation; CV helps production ease and campfire brevity. The optimum is unlikely to be "all CV" or "all CVC."

5. **Go / no-go for a later pilot** (5–10 non-Ring-1 CV→CVC moves only if):
   - Clear free CVC path or planned family reshuffle
   - Projected mean compound length stays campfire-friendly (ideally ≤7)
   - Pronounceability Health stays high despite RN-32's CVC ease penalty
   - Learn phrases + goldens refreshed in the same change set

**Provisional policy to evaluate for *new* roots (not a rewrite):** prefer CVC for new non-particle primitives; reserve CV for grammar particles, pronouns, and a small ultra-high-frequency closed set; resolve prefix-family conflicts by choosing the better of CV vs its CVC family.

**Verdict of this thought experiment:** Do **not** mass-respell. Do treat essential-CV assigner pressure as the primary density driver worth revisiting. Keep Package A + prefix-safe CI. Defer any pilot until counterfactual headroom improves or a bounded reshuffle is designed on purpose.

## What Changed

Documentation and measurement only:

- [`scripts/fonoran-cv-density-project.js`](../../scripts/fonoran-cv-density-project.js) + `npm run fonoran:cv-density:project`
- [`data/fonoran-cv-density-projection.json`](../../data/fonoran-cv-density-projection.json)
- Clarification in [`docs/fonoran-prefix-safe-roots.md`](../fonoran-prefix-safe-roots.md) that exclusivity ≠ semantic ban

Seeds, lab spellings, and Health formula unchanged.

## Open Questions

1. Should `tierGate` stop forcing essentials onto CV, or only soften the ≥75th-percentile CVC penalty?
2. What belongs in the "small CV closed set" if Ring 1 adopts a budget: particles only, or also `gi`/`se`/`wi`-class high-frequency verbs?
3. Would learners actually recover CVC-heavier compounds better in a campfire playtest, or is that an intuition that fails RN-12's communication test?
4. If free CV slots stay at zero, is the next capacity move expanding the CVC pool (more coda×vowel combinations) rather than freeing CVs?

## References

- [RN-32 · Phonetic constitution](/research/notes/fonoran-phonetic-constitution): ease vs join rules this note separates
- [RN-09 · Gen 3.1 distinctiveness](/research/notes/making-invented-words-memorable-gen-3-1): historical prefix hard-skip
- [Prefix-safe CV/CVC](../fonoran-prefix-safe-roots.md): live exclusivity inventory
- [`docs/fonoran-constitution.md`](../fonoran-constitution.md)
- If a pilot is greenlit later: bounded non-Ring-1 CV→CVC moves with Health + Learn + golden refresh in one change set

**Interactive demo:** [Health](/tools#health) · [Dictionary](/language#dictionary)

**Source:** [`data/fonoran-cv-density-projection.json`](../../data/fonoran-cv-density-projection.json), [`scripts/fonoran-cv-density-project.js`](../../scripts/fonoran-cv-density-project.js), [`tools/fonoran-root-sound-assign.js`](../../tools/fonoran-root-sound-assign.js)
