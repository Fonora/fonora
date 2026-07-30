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

One number from 0 to 1, six weighted factors. The question it estimates is "would a stranger who knows the parts recover the whole?"

| Factor | Weight | What raises it |
| --- | --- | --- |
| familiarity | 0.25 | parts are core vocabulary rather than rare |
| flattened length | 0.20 | fewer total root syllables |
| simplicity | 0.15 | fewer direct parts |
| transparency | 0.15 | every part is a real known root |
| ambiguity | 0.15 | the combination points at one meaning |
| concreteness | 0.10 | parts are physical rather than abstract |

The curves, in full:

- **familiarity**: average over parts, where communicative core = 1.0, extended core = 0.7, complete = 0.4, unknown = 0.2
- **simplicity**: 1 or 2 parts = 1.0, 3 parts = 0.72, 4 = 0.48, more = 0.3
- **flattened length**: 2 roots or fewer = 1.0, 3 = 0.85, 4 = 0.6, 5 = 0.4, more = 0.2. Flattened means after expanding nested compounds
- **transparency**: the fraction of parts that resolve to known roots
- **ambiguity**: starts at 1.0, loses 0.12 for each vague part (`thing`, `substance`, `form`, `part`, `do`, `make`, `source`, `place`, `mark`, `change`) and 0.25 for each extra concept claiming the identical combination, up to three
- **concreteness**: average over parts, where survival/body and space/motion = 1.0, social = 0.85, emotion = 0.8, time = 0.7, thinking = 0.55, abstract = 0.35

Then a semantic-role check runs, and it can cut the score nearly in half. A composition loses campfire points for being all glue with no concrete anchor, for using `make` or `do` as the head with only a material modifier (`stone + make` is not a recoverable name for a specific tool), and for missing the kind of root its category needs. If that check is not perfect, the whole score is multiplied by `0.5 + 0.5 × campfire`.

Finally, a composition using an `r` or `j` root loses 0.005, purely so a clean alternative wins an otherwise exact tie.

## Step 3: throw out what is not buildable

These are hard gates. A candidate that fails is discarded no matter how well it scored:

- it would shadow a primitive root id
- a part does not resolve
- its spelling is already taken by another word
- it collides two identical consonants at the seam (Constitution Rule 7)
- **it does not segment back to itself uniquely.** The spelling is re-split against the whole root inventory, and the candidate is rejected unless there is exactly one way to read it and that way is the intended parts

The segmentation gate is the one that does the most work, and it is the reason a compound cannot be a riddle: if `yenan` could be read as two different root sequences, nobody can decode it in conversation.

## Step 4: order the survivors

Sorted by, in strict order: campfire score, then recoverability score, then fewer flattened roots, then better seam quality.

## Step 5: decide whether to replace what is already there

Winning the ranking is not enough to change the language. The gates:

| Situation | Result |
| --- | --- |
| The form is locked by playtest or human decision | never changes |
| Top candidate beats the current form by 0.02 or more | promote |
| Current form is longer than 4 flattened roots and a shorter valid one exists | promote the shortest |
| Current form is invalid | promote the top |
| Otherwise | hold, and record why |

The 0.02 margin exists so noise does not churn the dictionary. `--force` (what `fonoran:regen:four-rules` passes) drops the margin and promotes whenever the top candidate differs, which is how you see what the scoring would choose on a clean slate.

Compounds are processed in topological order, so a compound built from another compound sees the final spelling of its parts.

## What it actually proposes

A force run today reports 18 disagreements with the committed file. Two examples, both instructive:

```text
walk:  move+still  →  still+move
lamp:  light+use    →  fire+hold
```

The first is pure ordering, where the head root changes which reading a stranger lands on. The second replaces an abstract part with a concrete one, which is the concreteness factor doing its job. Nothing is written until `--apply`, because the score ranks and a human decides.

## Where the truth lives

If this page and the code disagree, the code wins, and this page is the bug.

| Thing | Source |
| --- | --- |
| Selection and promotion gates | `tools/fonoran-preferred-select.js` |
| Candidate pool and ranking | `tools/fonoran-expression-candidates.js` |
| The six-factor score | `tools/fonoran-understandability.js` |
| Semantic-role check | `tools/fonoran-campfire-composition.js` |
| Seam and segmentation rules | `tools/fonoran-gen3-readability.js` |
| The compounds themselves | `data/fonoran-compounds.json` |
| Rules 6 and 7 this enforces | [fonoran-constitution.md](fonoran-constitution.md) |
