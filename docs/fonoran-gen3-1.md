# Fonoran Gen 3.1: Phonetic Distinctiveness Layer

> **Status:** experimental, extends Gen 3 without changing semantic coordinate theory  
> **Previous:** [`fonoran-gen3.md`](fonoran-gen3.md) (frozen for comparison)

Gen 3.1 adds a **phonetic distribution layer** on top of unchanged DDA semantics (depth · mode · aspect). Coordinates in `⟨D,M,A⟩` notation are identical in meaning to Gen 3; only **roman phonetic realization** is optimized for human learnability.

---

## What changed

| Layer | Gen 3 | Gen 3.1 |
| --- | --- | --- |
| Semantic coordinates | DDA grid | **Unchanged** |
| Primitive inventory | 36 grid-native | **Unchanged** |
| Root generator | Grid repair only | **Distinctiveness scoring + vowel spread + optional CVC** |
| Indo-European repair | None | **None** (still Fonora-native only) |
| Focal `-ee` rhyme cluster | 7 roots | **≤3 per rhyme class** |
| Prefix ambiguities | `le`/`lee`, `de`/`dee` | **Eliminated** |

---

## Phonetic realization (not semantic change)

Semantic aspect **A** remains authoritative in coordinates. Phonetic vowel may **spread** within Fonora-native pools:

```json
"focal": ["i", "e", "o", "u", "a", "ae", "oh", "ee"]
```

When a root uses a non-canonical vowel, coordinates record:

- `vowel_canonical`, vowel from aspect map (semantic)
- `vowel`, phonetic realization chosen
- `phonetic_spread: true`, spread applied

Example: **mark** stays `⟨index, flux, focal⟩` but root may be `si` (phonetic `i`) instead of Gen 3's `see`.

---

## Distinctiveness algorithm

For each primitive (derivation-linked first):

1. Enumerate candidates: canonical grid → manner rotation → place rotation → **CVC extensions** (plain coda from grid)
2. Score each candidate with **distinctiveness penalty**:
   - duplicate root
   - prefix overlap (unless explicitly allowed)
   - ≥3 roots sharing rhyme class
   - same onset / same rhyme / one-vowel-difference
3. Pick lowest penalty; prefer **phonetic-only** spread before grid repair
4. Record `distinctiveness_score` (0–1000 scale, higher = more distinct)

### Hard constraints

- **≤3 CV roots** per pool vowel class
- **≤3 roots** per rhyme key (vowel + optional coda)
- **No prefix pairs** unless listed in `allowed_prefix_pairs` (empty by default)

---

## Success criteria (2026-06-22 run)

| Criterion | Target | Gen 3.1 result |
| --- | --- | --- |
| Max shared vowel ending (CV pool) | ≤3 | **3** ✓ |
| Max rhyme class | ≤3 | **3** ✓ |
| Prefix overlaps | none | **0 high-severity** ✓ |
| Example compounds unique parse | 100% | **100%** ✓ |
| Pronounceability | >90 | **96** ✓ |
| Parseability | >95 | **100** ✓ |
| Memorability | improve | **85** (Gen 3: 70) ✓ |
| Grid repair rate | ≤22% ideal | **31%** (documented tradeoff) |

Grid repair rate rose slightly because distinctiveness sometimes requires manner/place rotation at reserved throat cells, a documented tradeoff for rhyme reduction (see `npm run fonoran:gen3:compare`).

---

## Example derivations (Gen 3.1 roots)

| Concept | Composition | Compound |
| --- | --- | --- |
| river | flow + path | **xaechlik** |
| planet | bound + field + motion | **pikopleh** |
| speaker | signal + agent | **kuda** |
| language | signal + bond + group | **kuraeñok** |
| memory | mark + container + static | **señohchit** |
| storm | wave + change + field | **xotshaepkop** |
| community | group + bond + identity | **ñokraetee** |
| question | probe + unknown | **logha** |

Familiar labels remain reviewer aids only.

---

## Files

| File | Role |
| --- | --- |
| [`data/fonoran-gen3-1-config.json`](../data/fonoran-gen3-1-config.json) | Gen 3 config + phonetic pools + distinctiveness weights |
| [`data/fonoran-gen3-1-roots.json`](../data/fonoran-gen3-1-roots.json) | Generated inventory |
| [`tools/fonoran-gen3-1.js`](../tools/fonoran-gen3-1.js) | Generator |
| [`tools/fonoran-gen3-distinctiveness.js`](../tools/fonoran-gen3-distinctiveness.js) | Scoring utilities |
| Live Fonoran at `/fonoran/` | Health, parser, Language Explorer for your lab bucket |

### Commands

```bash
npm run fonoran:gen3:1          # regenerate roots
npm run fonoran:gen3:compare    # print score comparison (stdout)
npm run fonoran:gen3:semantic   # semantic integrity report → reports/
```

Gen 3 files are **preserved** for side-by-side reference and DDA inference.

---

## Design notes

- **CVC extensions** use plain codas from the Fonora grid (`p,t,ch,k,h`), not English borrowings
- Three-root compounds remain in examples (working-memory load documented; not shortened in 3.1)
- Future Gen 3.2 may add compound boundary markers without touching DDA theory
