# Meaning from coordinates: the Gen 3 DDA experiment

## Research Question

[RN-07](/research/notes/roots-from-grammar) documented two concept-first vocabulary generators (Gen 1 (hand roots plus grammar-vowel inflection) and Gen 2 (semantic coordinates with Indo-European collision repair). Both could produce systematic word families for demos, but both still began from human labels: *water*, *person*, *light*. Neither asked what meaning might occupy the Fonora articulation grid if you assumed no prior word for any of those things.

RN-07 closed with an explicit inversion:

**What if coordinates were inputs and words were outputs, and familiar concepts like *river* appeared only as derivations from grid-native pieces, never as primitives?**

Gen 3 was the first full attempt to answer that question. It shipped the same week Gen 1 and Gen 2 were archived, on the same day as the Fonoran language lab toolchain (`5b6bc58`, Jun 24, 2026).

## Hypothesis

The working hypothesis was that **meaning is a coordinate**. Every primitive is a stable point in a three-axis space, **Depth** (place of articulation), **Mode** (manner modifier), **Aspect** (vowel class): written as ⟨D, M, A⟩ and abbreviated **DDA**.

From that premise:

- A root is a **named coordinate**, not an English noun in disguise.
- A compound is a **path through coordinate space**, composed by concatenating roots general → specific.
- Familiar glosses (*river*, *planet*, *speaker*) appear **only at the derivation layer**, as reviewer annotations on compositions that a coordinate-literate reader could parse without consulting English.

The hypothesis was not that the grid would magically produce one correct ontology. [`docs/fonoran-gen3.md`](../fonoran-gen3.md) §1.5 lists several articulation→meaning guesses (does throat imply abstraction? does front-of-mouth imply nearness?) as **design questions with partial answers**, not axioms. Gen 3 was an experiment in whether a coherent primitive inventory could be *justified from coordinates alone*, with **no Indo-European lexicon repair**: the hygiene layer Gen 2 had relied on.

## Approach

### The inversion

Gen 3 reframed the generation direction:

| Generation | Starting point | Direction |
| --- | --- | --- |
| Gen 1 | English-like roots | concept → word |
| Gen 2 | Human primitives + IE repair | concept → coordinates → word |
| **Gen 3** | Articulation topology | **coordinates → primitive → compound → familiar concept** |

The lip-to-throat production path was read as a semantic gradient: **interface** (outer contact) through **index**, **junction**, and **emanation** to **origin** (pre-articulate source). Mode modifiers mapped to dynamics, **packet** (plain stop), **live** (voiced), **flux** (friction), **hollow** (nasal), **passage** (glide). Aspect came from vowel-class glyphs (⚬∋ contact, ⚬∩ focal, ⚬⌓ struct, and so on).

### What was built

The implementation is deliberately small and mechanical.

**[`data/fonoran-gen3-config.json`](../data/fonoran-gen3-config.json)** holds the articulation meaning map, 36 primitive definitions (each with `D`, `M`, `A`, and a coordinate-native gloss), and example derivations. None of the primitives are English nouns; categories emerge from DDA topology, not modern taxonomy.

**[`tools/fonoran-gen3.js`](../tools/fonoran-gen3.js)** resolves each primitive mechanically:

```
place  = depth_to_place[D]
manner = mode_to_manner[M]
onset  = sound_grid[manner][place]
vowel  = aspect_vowel[A]
root   = onset + vowel
```

When the sound grid returns a null onset (throat+nasal and throat+glide remain undefined in Fonora's grid, per RN-01) or when two primitives collide on the same CV syllable, **grid repair** rotates manner, then place, then vowel until a unique root is found. Repair is grid-native only, no rotation against English, Latin, or Greek look-alikes.

**[`data/fonoran-gen3-roots.json`](../data/fonoran-gen3-roots.json)** is the generated output (`npm run fonoran:gen3`): 36 primitives → 36 unique roots, plus composed derivations.

The flagship derivation example, documented in the config and repeated in the audit:

```
flow  = ⟨emanation, flux, turbulent⟩   → xae
path  = ⟨index, passage, struct⟩       → li
river = flow + path                    → xaeli
```

*River* is not a primitive. The English label is annotation; the compound gloss is "continuous change along directed passage."

**[`docs/fonoran-gen3.md`](../fonoran-gen3.md)** (~460 lines) is the primary theory document: semantic manifold, primitive inventory by depth, derivation walkthroughs, and an explicit statement that all prior Fonoran work (Gen 1 inventory, Gen 2 primitives, English-adjacent roots) is **disposable** relative to this rebase. Gen 3 intentionally did **not** modify the Fonora translator, phoneme pipeline, or `language-rules.md`; it sat on top of Phase I's sound grid as a separate vocabulary experiment.

The language lab at `/fonoran/` shipped the same week (`d2e6315`), with DDA inference (`tools/fonoran-dda-infer.js`) wired in as batch metadata on user-built syllables, coordinates as invisible semantic infrastructure, not as the authoritative lexicon source.

### Design constraints carried forward

- **Throat gaps are features.** Illegal coordinates force rotation rather than invented throat consonants (RN-01's open cells).
- **Explainability over familiarity.** Every root must be recoverable from ⟨D,M,A⟩ without English.
- **Compounds concatenate** with no inflectional vowel paradigms (explicitly abandoning Gen 1's a/e/i/o/u role suffixes).
- **Scale path documented but not executed:** the DDA cube has 5 × 5 × 8 = 200 cells (~25 phonetically null); Gen 3 named 36 of them, with full enumeration listed as backlog in §8.

## Evaluation

There was no formal user study or cross-linguistic comprehension test at launch. Evaluation was tool-driven, using scripts that shipped alongside the generator:

- **`npm run fonoran:gen3`**: deterministic regeneration from config; 36/36 unique roots on first run.
- **`npm run fonoran:gen3:audit`**: [`tools/fonoran-gen3-audit.js`](../tools/fonoran-gen3-audit.js) plus [`tools/fonoran-gen3-readability.js`](../tools/fonoran-gen3-readability.js), writing `reports/fonoran-gen3-human-readability-audit.md` (gitignored; regenerable).
- **`node tools/fonoran-gen3.js --derivations`**: prints example compounds for manual inspection.
- **Dictionary / lab Health panel**: live bucket scoring reuses the same readability layer on user-built vocabulary.

The audit's stated goal: learnability through **Fonoran internal logic**, not English familiarity. Scores on the frozen Gen 3 reference inventory:

| Dimension | Score | What it measured |
| --- | ---: | --- |
| Learnability | 76/100 | Coordinate-first pedagogy; penalized high-severity warnings |
| Pronounceability | 96/100 | Mean root pronounceability |
| Memorability | 70/100 | Root distinctiveness (phonetic clusters, similar roots) |
| Parseability | 100/100 | Unique segmentation of eight example compounds |
| Algorithmic feel | 22% | Share of roots requiring grid repair |

Five warnings (three high). The questions the team was actually asking:

- Can every primitive be taught from its coordinate chart before its roman root?
- Do example compounds parse uniquely without boundary markers?
- Does focal aspect (`⚬∩` → `ee`) create phonetic clusters that undermine ear-discrimination?
- Do repair-shifted roots (8/36) weaken the strict coordinate→form teaching story?

## Findings

**The inversion was real and demonstrable.** Gen 3 produced a 36-root inventory where every primitive has a coordinate-native gloss, and familiar concepts compose from those pieces. *Planet* decomposes to bound + field + motion → `peekole`; *speaker* to signal + agent → `keede`. A reader who accepts the coordinate chart can walk through the gloss without treating English as the source of truth. For a brief period, Gen 3 held **experimental authority** over grid-native semantics in the docs.

**Coordinate correctness and communication are not the same thing.** The audit's parseability score was perfect on the curated derivation set, and pronounceability was high, but memorability landed at **70/100**. Seven focal-aspect roots shared an `-ee` rhyme class (`pee`, `wee`, `tee`, `see`, `lee`, `kee`, `dee`), so discrimination relied almost entirely on onset consonants. Prefix overlaps (`le`/`lee`, `de`/`dee`) flagged segmentation risk before compounds were even stacked. The approach optimized *explainable decomposition*, not *recoverable meaning by ear*: a gap that would matter once real speakers entered the loop.

**Partial semantic hypotheses were documented honestly.** Throat as **origin** (generative source) worked better than throat-as-abstraction. Distance and nearness were compounds, not place rows. Friction→flux, nasal→hollow, and glide→passage held up; front-of-mouth-as-proximity did not.

**Grid repair was necessary but visible.** 22% of roots needed rotation, including `unknown` at nine steps and `void`/`far` at eight, because throat gaps and duplicate collisions are structural, not accidental. Repair preserved uniqueness without English lexicon hygiene, but it meant the roman syllable sometimes **drifted** from the naive coordinate→phoneme mapping, complicating pedagogy.

**The derivation layer worked on paper.** All eight documented compounds (`xaeli`, `peekole`, `keede`, `keeriroh`, `seeñohji`, `xoshaeko`, `rohriti`, `leeta`) had unique segmentations in the audit. Longer three-root forms (`keeriroh`, `seeñohji`) were speakable but effortful; the audit recommended defaulting to two-root compounds for human-facing vocabulary.

Nothing here proved that articulatory topology *is* semantic topology, only that a consistent coordinate story could be written, generated, and scored before human playtests challenged it.

## What Changed

Gen 3 did not survive as the production design. Commit `5cfe28a` (constitution / campfire-test pivot) **demoted the entire Gen 3/DDA track** to archive reference: roots reorganized by **human experience** tiers, compounds judged by whether another root-knower would recover meaning, not by coordinate correctness. [`docs/fonoran-gen3.md`](../fonoran-gen3.md) now opens with that demotion notice.

What persisted:

- **Grid-linked phonology**: roots still resolve through Fonora's sound grid; DDA inference remains on lab items as advisory metadata (`tools/fonoran-dda-infer.js`).
- **Composition general → specific**: compounds as concatenated invariant roots, not vowel-inflected paradigms.
- **Distinctiveness as a separable layer**: the memorability failure motivated the next experiment without moving semantic coordinates.

What was superseded:

- **Coordinate-native primitives as the authoritative lexicon** (36 DDA roots replacing human-curated communicative core).
- **"Start from the grid, name the coordinates, compose the world"** as the project's primary framing.
- **Derivation labels as quasi-translations**: the constitution now treats multiple compound strategies for the same idea as valid if meaning is recoverable.

Later notes in sequence:

- **RN-09: Making invented words memorable (Gen 3.1)**: phonetic distinctiveness layer over **unchanged** DDA coordinates; memorability 70 → 85 at a 31% grid-repair cost
- **RN-10: Optimal sounds, wrong premise**: Huffman-like syllable allocation for ~200 primitives; still concept-first, still superseded
- **RN-11: The irreducible dimensions of meaning**: meaning-first inventory with phonetics deferred
- **RN-12: The campfire test (communication over correctness)**: constitution and playtest metric that demoted DDA and all bulk-generator authority

Gen 3's backlog item to reconnect Gen 1 grammar-vowel inflection to grid-native roots never shipped. Role-marking moved to invariant particles per [`docs/fonoran-grammar.md`](../fonoran-grammar.md).

## Open Questions

Gen 3 answered "can meaning be stated as grid coordinates?" with a qualified yes for a 36-root archaeology demo, and a clear no for "is that enough for humans to learn and use the language?"

The audit surfaced a sharper, separable question:

**Could learnability improve without moving the DDA coordinates that give each root its meaning?**

Seven `-ee` rhymes and glide-`l` onsets suggested that distinctiveness might be a **phonetic** problem layered on top of a **semantic** coordinate system: fix the sounds, keep the ⟨D,M,A⟩ story intact.

A parallel thread asked whether optimal syllable allocation over a larger primitive set could succeed where coordinate purity alone did not (**RN-10**). And once automated scores showed their limits, whether **human guess-the-meaning playtests** should replace coordinate correctness as the authority metric (**RN-12**).

## References

**Related commits**
- `5b6bc58`: Add Fonoran language tools, API, and PostgreSQL-backed storage (Gen 3 generator, config, roots JSON, DDA inference, readability audit tooling)
- `14d5d84`: Document platform layers and Fonoran guides; [`docs/fonoran-gen3.md`](../fonoran-gen3.md) theory write-up
- `d2e6315`: Add Fonoran language builder web app at `/fonoran/`
- `52b2a1a`: Add Fonoran Grammar spec and example-first language documentation
- `262ea23`: Add semantic coordinates visual chart and improve DDA UX language
- `5cfe28a`: Reorient Fonoran around the communication experiment; demote Gen 3/DDA track; add [`docs/fonoran-constitution.md`](../fonoran-constitution.md)
- `b9a306f`: Cross-link archive docs and doc viewer to research notebook

**Documentation:** [`docs/fonoran-gen3.md`](../fonoran-gen3.md) (DDA Gen 3 archive, primary theory source)

**Interactive demo:** [Dictionary](/language#dictionary) (early consumer of generated inventory; current lab bucket at `/language/` is authoritative for live work)

**Source:** [`tools/fonoran-gen3.js`](../tools/fonoran-gen3.js), [`data/fonoran-gen3-config.json`](../data/fonoran-gen3-config.json), [`data/fonoran-gen3-roots.json`](../data/fonoran-gen3-roots.json), [`tools/fonoran-gen3-readability.js`](../tools/fonoran-gen3-readability.js)

**Future research notes:** RN-09 (Gen 3.1 distinctiveness), RN-10 (Huffman primitive roots), RN-11 (semantic foundation), RN-12 (campfire test / constitution)
