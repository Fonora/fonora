# Algorithm: how a concept gets its sound

> **One page. The deterministic root generator, start to finish.**
> Code: [`tools/fonoran-root-sound-assign.js`](../tools/fonoran-root-sound-assign.js), driven by [`tools/fonoran-root-candidates.js`](../tools/fonoran-root-candidates.js).
> No model is involved at any step. Same inventory plus same config plus same locked roots produces the same spellings, every time.

## The problem it solves

There are 136 concepts and a limited supply of easy syllables. Short, easy sounds must go to the concepts you say most, and no two roots may be confusable. Doing that by hand at this scale produces favouritism and collisions, so it is scored instead.

**In:** `data/fonoran-concept-inventory.json` (concepts, each with a priority class)
**Out:** one spelling per concept, into `data/fonoran-approved-roots.json` after human approval

## Step 1: order the concepts by how much they matter

Each concept carries a human-assigned priority class. The class becomes a number, and position in the inventory breaks ties:

| Class | Weight |
| --- | --- |
| essential | 100 |
| common | 80 |
| useful | 60 |
| extended | 40 |
| questionable | 20 |

```text
priority = weight × 1000 − inventory_index
```

Concepts are then processed highest first, so `person` chooses its sound before `wrist` does. This ordering is the entire reason the cheap syllables end up on the common words.

## Step 2: build the syllable pool, cheapest first

Only one-syllable forms: **CV** or **CVC**. Multi-syllable forms are reserved for compounds. Each form gets a phonetic cost, and the pool is sorted by it.

| Tier | Onsets | Vowels | Cost from |
| --- | --- | --- | --- |
| preferred CV | b d f g k l m n s t | a e i o u | 1 |
| secondary CV | h w y | a e i o u | 20 |
| tertiary CV | p ch sh | a e u | 35 |
| CVC | the 10 preferred, coda n m t k s l | a e | 50 |

Vowels are themselves ordered by cost in that order, so `ba` is cheaper than `bu`.

Three sets never enter the pool: the 15 reserved particle forms, an excluded list (`pi`, `pee`, `po`, `poo`, `pu`, `fa`, `fu`), and anything starting with `r` or `j`, which rulebook rule 4 bans outright.

## Step 3: give each concept a cost it should be aiming at

A concept does not simply take the cheapest form left. It gets a target, from its position between the lowest and highest priority in the run:

```text
target_cost = 1 + (1 − t) × 85        t = 0 at lowest priority, 1 at highest
```

The top concept aims at cost 1, the bottom at 86. Missing your target costs `12 × the difference`. This is what stops a low-priority concept from grabbing a premium syllable just because it was free.

## Step 4: reject what is not allowed

These are hard blocks, checked before scoring. A blocked form is skipped entirely:

- the form is already taken
- it starts with `r` or `j`
- it is **not prefix-safe** against every root already assigned, meaning no root may be the start of another (rulebook rule 5). Enforced here rather than left to CI
- the editorial collision profile blocks it
- it duplicates an existing root, or overlaps a prefix while the concept sits in the top half of priority

## Step 5: score everything that is allowed, and take the lowest

Every surviving form gets one number. Lowest wins; a cost tie breaks toward the cheaper syllable.

| Added penalty | Amount |
| --- | --- |
| Distance from target cost | difference × 12 |
| Sounds too like an existing root | 60 to 90 per kind of similarity, scaled (below) |
| Form is a particle, or repeats a nearby root | 5000 |
| Form starts with a particle it will follow in speech | 200 |
| Same onset beyond 5 already used | 120 each |
| Same onset beyond 3, for a high-priority concept | 200 each |
| Same rhyme beyond 4 already used | 150 each |
| CVC when the concept is in the top 25% by priority | 2500 |
| Anything but CV when the concept is in the top 8% | 4000 |
| Preferred CV taken by an extended or questionable concept | 1500 |
| Being CVC at all | 30 |
| Being a tertiary onset (p, ch, sh) | 40 |
| Reads badly at a compound seam | scaled by warning count |

The similarity penalties are multiplied by a **spread factor**, so frequent words are pushed apart harder than rare ones: 1.8 for essential and common, 1.3 for useful, 1.0 below that. This is what prevents `ba/be/bi/bo` from all being high-frequency words.

If literally nothing scores, the generator falls back to the first form that passes the hard blocks, and marks the assignment as a fallback.

## Step 6: never respell an approved root

Approved spellings are reserved before the run starts, and are emitted unchanged. Rejected spellings are reserved too, so a form you threw out is never quietly handed to a different concept. This is why adding one concept assigns one new root instead of reshuffling the language.

## Does it work?

The observable result across the 135 approved roots. Cheap CV forms concentrate at the top, and the bottom of the inventory gets no premium syllables at all:

| Class | CV | CVC |
| --- | --- | --- |
| essential | 22 | 3 |
| common | 22 | 71 |
| useful | 4 | 10 |
| extended | 0 | 3 |

`person` is essential and holds `ba`. `path` is useful and holds `nan`. `know` is essential and holds `hu`, a secondary onset, which is the kind of compromise the scoring makes when the preferred onsets in that cost band are exhausted.

## Where the truth lives

If this page and the code disagree, the code wins, and this page is the bug.

| Thing | Source |
| --- | --- |
| Scoring and assignment | `tools/fonoran-root-sound-assign.js` |
| Priority class weights | `tools/fonoran-priority.js` |
| Onsets, vowels, caps, exclusions | `data/fonoran-primitive-roots-config.json` |
| The concepts themselves | `data/fonoran-concept-inventory.json` |
| Approved output | `data/fonoran-approved-roots.json` |
| Rules 1 and 5 this enforces | [fonoran-rulebook.md](fonoran-rulebook.md) |
