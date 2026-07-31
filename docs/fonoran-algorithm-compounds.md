# Algorithm: how a compound is chosen

> **One page. The deterministic compound selector, start to finish.**
> Code: [`tools/fonoran-preferred-select.js`](../tools/fonoran-preferred-select.js) (choosing), [`tools/fonoran-expression-candidates.js`](../tools/fonoran-expression-candidates.js) (candidates and ranking), [`tools/fonoran-understandability.js`](../tools/fonoran-understandability.js) (the score).
> Run it with `npm run fonoran:regen:four-rules`. No model is involved at any step.

## The problem it solves

`river` could be `water + path`, or `path + water`, or `water + move`. All three are legal. Something has to pick one, and the pick has to be defensible and repeatable rather than whoever edited the file last.

**In:** `data/fonoran-compounds.json` (454 concepts, each with a preferred form and alternates), plus hand-written candidate strategies in `ASSOCIATION_SEEDS`
**Out:** the same file, with a preferred form per concept and the losers kept as alternates

## Step 1: gather candidates

For one concept, the pool is its current preferred form, its recorded alternates, and every hand-seeded strategy for it. Duplicates collapse. The pool is committed seed data only: nothing is generated at run time.

## Step 2: score each candidate for recoverability

One number from 0 to 1, six weighted factors plus an optional seventh. The question it estimates is "would a stranger who knows the parts recover the whole?"

| Factor | Weight | What raises it |
| --- | --- | --- |
| familiarity | 0.25 | parts are core vocabulary rather than rare |
| flattened length | 0.20 | fewer total root syllables |
| simplicity | 0.15 | fewer direct parts |
| transparency | 0.15 | every part is a real known root |
| ambiguity | 0.15 | the combination points at one meaning |
| concreteness | 0.10 | parts are physical rather than abstract |
| gloss alignment | 0.15, optional | the concept's own gloss names the parts |

The curves, in full:

- **familiarity**: average over parts, where communicative core = 1.0, extended core = 0.7, complete = 0.4, unknown = 0.2
- **simplicity**: 1 or 2 parts = 1.0, 3 parts = 0.72, 4 = 0.48, more = 0.3
- **flattened length**: 2 roots or fewer = 1.0, 3 = 0.85, 4 = 0.6, 5 = 0.4, more = 0.2. Flattened means after expanding nested compounds
- **transparency**: the fraction of parts that resolve to known roots
- **ambiguity**: starts at 1.0, loses 0.12 for each vague part (`thing`, `substance`, `form`, `part`, `do`, `make`, `source`, `place`, `mark`, `change`), 0.25 for each *other* concept claiming the identical combination (up to three), and 0.15 for each *other* concept whose preferred form uses the same roots in a different order (up to three). Both collision counts exclude the concept being scored — a committed form must never be penalized for colliding with itself, or the same roots in a never-used order look artificially cleaner and force runs churn on order flips. An order collision — `fire+food` cooked vs `food+fire` raw — leaves the listener nothing but ordering to hang the difference on, which is a riddle for both concepts
- **concreteness**: average over parts, where survival/body and space/motion = 1.0, social = 0.85, emotion = 0.8, time = 0.7, thinking = 0.55, abstract = 0.35
- **gloss alignment**: the fraction of parts the concept's own gloss names (`tools/fonoran-compound-semantics.js`, the same attestation the compound audit reports). Only blended when the gloss is informative — a gloss that just restates the headword cannot judge — in which case the total becomes a weighted average over 1.15, so gloss-less scoring is unchanged. This is what makes `bone_tool` composed of `stone+use` score below a candidate its gloss ("fashioned from animal bone") actually describes

Then a semantic-role check runs, and it can cut the score nearly in half. A composition loses campfire points for being all glue with no concrete anchor, for using `make` or `do` as the head with only a material modifier (`stone + make` is not a recoverable name for a specific tool), and for missing the kind of root its category needs. If that check is not perfect, the whole score is multiplied by `0.5 + 0.5 × campfire`.

Finally, a composition using an `r` or `j` root loses 0.005, purely so a clean alternative wins an otherwise exact tie.

## Step 3: throw out what is not buildable

These are hard gates. A candidate that fails is discarded no matter how well it scored:

- it would shadow a primitive root id
- a part does not resolve
- its spelling is already taken by another word
- it collides two identical consonants at the seam (rulebook rule 7)
- **it does not segment back to itself uniquely.** The spelling is re-split against the whole root inventory, and the candidate is rejected unless there is exactly one way to read it and that way is the intended parts

The segmentation gate is the one that does the most work, and it is the reason a compound cannot be a riddle: if `yenan` could be read as two different root sequences, nobody can decode it in conversation.

Spelling claims are refcounted per concept, and every row's committed spelling is claimed before the first row is re-decided. Without that, a concept early in dependency order could be promoted *into* a spelling a later row still holds — which is how `forget` and the locked `ignorance` were once both spelled `tamhu`.

## Step 4: order the survivors

Sorted by, in strict order: campfire score, then **collision-free before colliding, but only at equal or shorter length**, then recoverability score, then fewer flattened roots, then better seam quality.

The length condition on the collision tier came from editorial review: a clean candidate may not buy its way out of a collision by adding a root. When `gift`'s natural `good+give` collided with the locked `please` (`give+good`), the selector used to reach for `give+thing+good`; padding a word to dodge a collision is always the wrong resolution. The collision wants an editorial fix — merge the two concepts or recompose one of them — not a longer word. A clean candidate that is *longer* than a colliding one must now win on raw score, not on the tier.

## Step 5: decide whether to replace what is already there

Winning the ranking is not enough to change the language. The gates:

| Situation | Result |
| --- | --- |
| The form is locked by a human decision (`human` or the historical `playtest`) | never changes |
| Top candidate beats the current form by 0.02 or more | promote |
| Current form is longer than 4 flattened roots and a shorter valid one exists | promote the shortest |
| Current form is invalid | promote the top |
| Otherwise | hold, and record why |

The 0.02 margin exists so noise does not churn the dictionary. `--force` (what `fonoran:regen:four-rules` passes) drops the margin and promotes whenever the top candidate differs, which is how you see what the scoring would choose on a clean slate. One exception survives even a force run: an **order-only change** (same roots, different order) must beat the current form by the full margin, because when the scoring cannot tell two orders apart the difference is tie-break noise — without this, `walk` and `stop` swap between `move+still` and `still+move` on every run.

Compounds are processed in topological order, so a compound built from another compound sees the final spelling of its parts.

## What it actually proposes

A force run today reports **zero** disagreements with the committed file: the July 2026 editorial round locked twenty-one human decisions in, applied the surviving proposals, and iterated to a fixpoint where the committed dictionary is exactly what the selector would choose. Two examples from that round, both instructive:

```text
forget:  empty+know  →  know+empty   (applied — resolved a committed homograph)
family:  love+person →  (held: sanba stays)
```

The first resolved a committed homograph: `forget` and the locked `ignorance` both spelled `tamhu` until the refcounted spelling claims caught it. The second shows the collision tier protecting the canon: `person+bond` would align better with the gloss, but `partner` already claims that multiset, so `sanba` holds. Nothing is written until `--apply`, because the score ranks and a human decides.

The remaining proposals are mostly genuine editorial calls — order-collision pairs involving locked rows, and near-duplicate concept pairs (`cross`/`pass`, `book`/`document`, `carry`/`carrying`) where the honest fix is merging the concepts, not recomposing one of them.

## Where the truth lives

If this page and the code disagree, the code wins, and this page is the bug.

| Thing | Source |
| --- | --- |
| Selection and promotion gates | `tools/fonoran-preferred-select.js` |
| Candidate pool and ranking | `tools/fonoran-expression-candidates.js` |
| The weighted score | `tools/fonoran-understandability.js` |
| Gloss alignment | `tools/fonoran-compound-semantics.js` |
| Semantic-role check | `tools/fonoran-campfire-composition.js` |
| Seam and segmentation rules | `tools/fonoran-gen3-readability.js` |
| The compounds themselves | `data/fonoran-compounds.json` |
| Rules 6 and 7 this enforces | [fonoran-rulebook.md](fonoran-rulebook.md) |
