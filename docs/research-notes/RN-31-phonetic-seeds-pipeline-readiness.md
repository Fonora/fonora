---
status: Active
date: 2026-07-12
phase: phase-5
---

# Phonetic seeds, pipeline readiness, and the full-inventory cost cliff

## Research Question

[RN-30](/research/notes/synthetic-only-llm-validity) shipped the v4 Compositional Intuition Battery, inter-model reliability gate, and deterministic confusability audit, but those instruments assumed the **seed bank itself** was phonetically and semantically sound before expensive LLM evaluation. During a full-inventory run, compounds built from `up` = **ra** (difficult **r** onset per [`tools/fonoran-phonetic-weights.js`](../tools/fonoran-phonetic-weights.js)) were promoted as preferred forms even though phonetic deprioritization was wired only at the **proposal gate** for new roots, not retroactively on `ASSOCIATION_SEEDS` or heuristic preferred selection.

The vocabulary also grew from **111** curated compounds ([RN-20](/research/notes/synthetic-intuition-ranking)) to **484** via vocab survey and gap fills, while the Advanced GUI still advertised full inventory at **~$10+**, an order-of-magnitude underestimate discovered only after a live run reached **~11,930** planned A/B jobs.

This note addresses:

**Can Fonoran ship a complete built language on heuristic preferred forms after seed-layer phonetic enforcement, and what LLM pipeline steps are actually required vs optional at 484-compound scale?**

### Phonetic rules in force

This sprint applies the three hard phonetic rules specified in [RN-32](/research/notes/fonoran-phonetic-constitution). In brief:

1. **Root onset ease** -- roots should use cross-linguistically common onsets; `r` and `j` are the only "difficult" onsets in the active pool and are deprioritized at every selection point.
2. **Compound join audibility** -- identical consonants at a morpheme join are a hard build rejection; vowel-vowel and same-place consonant joins are penalized.
3. **Surface distinctness** -- no two compound surfaces may fall below 88% phoneme-feature distinctness (advisory audit; not hard-reject).

The discovery driving this sprint is that Rule 1 was wired into the proposal gate but was **not applied retroactively** to `ASSOCIATION_SEEDS`, heuristic preferred-form selection, or the primitive root spellings themselves.

### Primitive root rename

After seed and compound remediation, the three primitives with difficult-onset spellings (`ra`=up, `ju`=down, `je`=bone) were also renamed to clean-onset CV roots:

| Concept | Old spelling | New spelling | Onset tier |
| --- | --- | --- | --- |
| up | ra | **wa** | very safe (w) |
| down | ju | **do** | very safe (d) |
| bone | je | **bu** | very safe (b) |

All 481 built compounds resolve correctly under the new spellings. Course phrases rebuilt and verified: 0 occurrences of the old spellings remain.

## Hypothesis

1. **Words exist without LLM full inventory:** `npm run fonoran:build` materializes spellings from `data/fonoran-compounds.json` + approved roots; `preferred_source: heuristic` is the default authority tier. LLM intuition ranks seed candidates; it does not mint vocabulary.
2. **Phonetic rules must apply at the seed layer:** `DIFFICULT_ONSETS` (`r`, `j`) on roots `up` = ra, `down` = ju, `bone` = je must not appear in `ASSOCIATION_SEEDS` or heuristic preferred compositions when clean alternatives exist; otherwise confusability and campfire audits pass while spoken surfaces still violate project phonetics.
3. **Calibration + reliability + free audits are the budget-conscious gate:** Pilot (3) → calibration (10) → inter-model reliability → confusability + seed-quality audits → human review checkbox is sufficient to validate methodology before any ~$150–250 full-inventory spend.
4. **Seed-bank fingerprinting** must drive per-step staleness in the GUI so legacy LLM rounds do not block or misreport progress after seed surgery.

## Approach

### Seed-layer phonetic remediation

Audit of [`tools/fonoran-expression-candidates.js`](../tools/fonoran-expression-candidates.js) `ASSOCIATION_SEEDS`:

| Root | Spelling | Onset tier | Seeds before | Seeds after |
| --- | --- | --- | --- | --- |
| `up` | ra | difficult (r) | 41 slots | 0 |
| `down` | ju | difficult (j) | 46 slots | 0 |
| `bone` | je | difficult (j) | 16 slots | 0 |

**46 concepts** had at least one difficult-onset seed; **25** had no clean alternative and received new compositional strategies:

- **Verticality:** `up` → `sky`, `air`; `down` → `earth`, `inside`
- **Body:** `bone` → `stone`, `body` + `bound`/`inside` (e.g. `spine` → `body + back`)
- **Examples:** `mountain` → `stone + big + still`; `rain` / `cloud` → `sky + water`; `climb` → `move + sky`; `sit` / `stand` → `body + earth + still` / `body + still + big`

**Result:** **0 / 1,455** seed slots use difficult-onset roots. Roots `up`, `down`, `bone` remain in the primitive inventory for compositional use elsewhere but are excluded from the seed bank driving LLM/heuristic candidate pools.

### Preferred-form promotion

`npm run fonoran:optimize-compounds` initially failed to demote **18** heuristic preferred forms still using `up`/`down`/`bone` because understandability scores tied (e.g. `earth + up` vs `earth + big` both ≈ 0.84).

Fixes in [`tools/fonoran-preferred-select.js`](../tools/fonoran-preferred-select.js) and [`tools/fonoran-expression-candidates.js`](../tools/fonoran-expression-candidates.js):

- **`rankCandidates`:** 0.005 understandability penalty when any component is a difficult-onset root; `difficultRootIds` loaded in `loadCandidateContext()`.
- **`selectPreferred`:** score margin waived to **0** when the *current* preferred uses a difficult root so any equal-or-better clean candidate can win.
- **Force promotion pass:** 18 remaining dirty preferred rows (including playtest-locked `rain`, `overhead`) rewritten to clean compositions; **0 / 484** preferred forms use difficult onsets.

Post-remediation build: **481 compounds built, 3 dropped** (collision/boundary), health **100/100** on learnability, pronounceability, memorability, parseability.

### Seed quality + phonetic purity gate

New script [`scripts/fonoran-seed-quality-audit.js`](../scripts/fonoran-seed-quality-audit.js) (campfire semantic-role rules via [`tools/fonoran-campfire-composition.js`](../tools/fonoran-campfire-composition.js)) now also asserts **phonetic seed purity**: any `ASSOCIATION_SEEDS` slot containing `up`/`down`/`bone` fails the gate. Report persisted to `data/fonoran-seed-quality-audit.json` (not recomputed on every status poll).

**Post-remediation audit:** 457/484 pass (94.4%), **0 hard failures**, phonetic seed purity **PASS**.

### Seed-bank fingerprint

[`tools/fonoran-seed-fingerprint.js`](../tools/fonoran-seed-fingerprint.js) hashes `ASSOCIATION_SEEDS`, semantic fields, and preferred compositions. Fingerprint **`7f2b72c7e9d98eaf`** invalidates prior `llm_evaluations` rounds (3,338 legacy rounds retained on disk but ignored for pipeline progress).

### Advanced LLM Evaluation Wizard

New GUI ([`js/fonoran-llm-pipeline-wizard.js`](../js/fonoran-llm-pipeline-wizard.js), [`tools/fonoran-llm-pipeline.js`](../tools/fonoran-llm-pipeline.js), [`tools/fonoran-api.js`](../tools/fonoran-api.js)) wraps RN-30 CLI steps:

| Step | Cost | Purpose |
| --- | --- | --- |
| Pilot | ~$1–3 | 3-concept smoke |
| Calibration | ~$5–15 | 10 reference concepts, primary judge |
| Inter-model reliability | ~$5–15 | Same 10 on secondary judge; Spearman ρ |
| Confusability audit | Free | Phoneme-feature near-pairs |
| Seed quality audit | Free | Campfire + phonetic seed purity |
| Review | Manual | Checkbox acknowledging calibration winners |
| Full inventory | **~$150–300** | All ~484 concepts × ~3 seeds × 5 personas × Tasks A+B × blind grader |
| Ship | Manual | fonora-data push, promote, production |

**Pipeline fixes during this work:**

- Per-step staleness from fingerprint (not global “any legacy round” downgrade).
- Post-job polling so calibration/reliability completion updates UI.
- Status dots: green = complete, yellow pulse = running, gray pulse = up next, gold = below-threshold warning.
- `blocked_reason` hints when full inventory waits on seed quality or review.
- Seed quality loaded from saved report file (not live audit on every status poll).

**Known GUI bug (fixed in same commit batch):** confusability showed **Stale** after a successful GUI audit because in-memory `job._confusability` lacked `seed_bank_fingerprint`; status API preferred cache over disk.

### Full-inventory cost cliff (111 → 484)

| Factor | RN-20 era (~$25 full run) | 2026-07-12 full inventory |
| --- | --- | --- |
| Compounds | 111 | 484 (~4.4×) |
| Personas | 4 | 5 (`sw_native` added) |
| Blind grader | v3 (lighter) | v4 separate call per Task A/B (~2× API) |
| Judge | Sonnet-class | Fable + adaptive thinking |
| Planned A/B jobs | ~2,400 rounds stored | **~11,930** jobs (~24k API calls with grader) |

A live full-inventory run was **stopped at ~636 / 11,930** jobs after the cost mismatch was discovered. **4,028** evaluation rounds remain stored (129 concepts with partial coverage); pilot, calibration, and reliability data for the current fingerprint are intact.

**RN-20 reference:** only **22/111** compounds auto-promoted via `optimize-compounds --use-llm` even after a complete v3 battery. Full inventory is refinement, not vocabulary creation.

## Evaluation

| Instrument | Result | Authority |
| --- | --- | --- |
| Seed phonetic audit | 0 difficult-onset seeds; 0 difficult preferred | Gate before LLM spend |
| Seed quality (campfire) | 94.4% pass, 0 hard failures | Gate before full inventory |
| Confusability | 108 near pairs, fingerprint `7f2b72c7e9d98eaf` | Advisory |
| Build | 481/484 built, 3 dropped, health 100 | Ship criterion |
| Calibration (cib-v4) | 10/10 concepts on current fingerprint | Primary judge weights |
| Inter-model reliability | Completed; ρ may be below 0.6 threshold | Warning, not hard block |
| Full inventory | **Aborted** (~5% of planned jobs) | Optional; not required to ship |

**Ship-ready definition (this pass):** heuristic preferred forms + clean seeds + built dictionary + calibration/reliability signal on 10 anchor concepts. **Not required:** LLM weights on all 484 compounds.

## Findings

1. **The language is built without LLM full inventory.** After seed remediation, `fonoran:optimize-compounds` (heuristic) + `fonoran:build` produces **481 speakable compounds**. LLM full inventory only changes which seed composition becomes `preferred` when `optimize-compounds --use-llm` promotes winners; historically ~20% of concepts even at 111-compound scale.

2. **Phonetic policy was enforcement-gapped.** `fonoran:compound-confusability` and campfire audit did not catch `ra`/`ju`/`je` in seeds because those tools score **surfaces and semantic roles**, not onset-tier membership in the seed bank. The fix belongs at `ASSOCIATION_SEEDS` + preferred selection + seed-quality phonetic purity check.

3. **Full inventory at 484 compounds is a different budget class than RN-20's 111.** The GUI label **~$10+** was stale copy from the smaller inventory and pre-grader protocol. Honest planning range: **~$150–300** and hours of runtime. Calibration + reliability (~$15–30 total) captures most methodological validation.

4. **Fingerprint-aware pipeline UI is necessary.** Without per-step staleness, users saw pilot/calibration flip between complete, stale, and pending when legacy rounds coexisted with a new seed bank, causing confusion and mistaken re-runs ($).

5. **Partial full-inventory data is usable but not required.** 4,028 stored rounds include calibration and reliability; 129 concepts have partial A/B coverage. Resume is possible in budget chunks; `--dry-run` shows `Remaining A/B` before spending.

## What Changed

| Area | Files |
| --- | --- |
| Seed remediation | [`tools/fonoran-expression-candidates.js`](../tools/fonoran-expression-candidates.js): 46 concepts rewritten; phonetic penalty in `rankCandidates` |
| Preferred selection | [`tools/fonoran-preferred-select.js`](../tools/fonoran-preferred-select.js), [`scripts/fonoran-optimize-compounds.js`](../scripts/fonoran-optimize-compounds.js) |
| Seed quality audit | [`scripts/fonoran-seed-quality-audit.js`](../scripts/fonoran-seed-quality-audit.js), [`tools/fonoran-campfire-composition.js`](../tools/fonoran-campfire-composition.js) |
| Campfire / semantic fields | [`tools/fonoran-root-semantic-fields.js`](../tools/fonoran-root-semantic-fields.js), `data/fonoran-root-semantic-fields.json` |
| Fingerprint | [`tools/fonoran-seed-fingerprint.js`](../tools/fonoran-seed-fingerprint.js) |
| LLM pipeline wizard | [`tools/fonoran-llm-pipeline.js`](../tools/fonoran-llm-pipeline.js), [`js/fonoran-llm-pipeline-wizard.js`](../js/fonoran-llm-pipeline-wizard.js), [`language/fonoran.css`](../language/fonoran.css), [`index.html`](../index.html), [`js/fonoran-advanced-page.js`](../js/fonoran-advanced-page.js) |
| API | [`tools/fonoran-api.js`](../tools/fonoran-api.js) |
| Compounds data | [`data/fonoran-compounds.json`](../data/fonoran-compounds.json): 484 compounds, clean preferred forms |
| Audit artifacts | `data/fonoran-seed-quality-audit.json`, `data/fonoran-compound-confusability.json` |
| Reliability report | `data/fonoran-llm-reliability.json` (current fingerprint) |
| Package | [`package.json`](../package.json): `fonoran:seed-quality-audit` |

**Submodule:** `external/fonora-data`: `fonoran-llm-evaluations.json` holds cib-v4 rounds (pilot, calibration, reliability, partial full inventory). Bump submodule pointer after committing data repo.

## Open Questions

- Should full inventory be **removed from the default wizard path** or replaced with “preferred-only” scoring (1 candidate/concept) to cut jobs ~3×?
- Should `optimize-compounds --use-llm` run automatically only on **reliability-eligible** calibration concepts until budget allows broader coverage?
- Does mean Spearman ρ &lt; 0.6 on calibration block promotion entirely, or is author review on 10 concepts enough ([RN-30](/research/notes/synthetic-only-llm-validity) left this open)?
- Human Puzzle Conversation on phonetically remediated compounds (`mountain`, `rain`, `climb`): do clean seeds recover as well in the ear as the old `up`/`down` compositions?
- Dynamic cost estimate in the wizard (`--dry-run` job count × grader multiplier × `estimateCallCost`) vs static strings.

## References

- [RN-32 · The Fonoran phonetic constitution](/research/notes/fonoran-phonetic-constitution) -- full specification of the three hard rules and where each is enforced
- [RN-20 · Synthetic intuition ranking](/research/notes/synthetic-intuition-ranking)
- [RN-30 · Synthetic-only LLM validity](/research/notes/synthetic-only-llm-validity)
- [RN-21 · Beginner core remediation](/research/notes/beginner-core-remediation)
- [docs/fonoran-llm-playtest-experiment.md](../fonoran-llm-playtest-experiment.md)
- [`tools/fonoran-phonetic-weights.js`](../tools/fonoran-phonetic-weights.js), [`tools/fonoran-seed-fingerprint.js`](../tools/fonoran-seed-fingerprint.js), [`tools/fonoran-llm-pipeline.js`](../tools/fonoran-llm-pipeline.js)
