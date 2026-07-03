# Optimal sounds, wrong premise

## Research Question

[RN-09](/research/notes/making-invented-words-memorable-gen-3-1) showed that phonetic learnability could be improved without touching semantic coordinates: Gen 3.1 spread vowels within Fonora-native pools, raised memorability from 70 to 85, and eliminated prefix ambiguities, reusing a distinctiveness scorer that still lives in the repo today. That work operated on Gen 3's **36 grid-native primitives**, where meaning was a DDA coordinate and familiar English labels like "river" appeared only at the derivation layer.

Gen 3.1 also left a practical ceiling in view. Thirty-six roots could seed a principled lexicon, but real communication needs a much larger shared core, person, water, give, inside, because, tribe, war, and Gen 3's derivation layer still required a reader to mentally decode coordinate trees. RN-09 closed by asking whether speakers would actually communicate by reconstructing those trees in real time. This note took a different tack first: keep the **phonetic machinery** Gen 3.1 had validated, but scale the **concept inventory** up to roughly Swadesh-list size and ask whether syllables could be allocated *optimally* across that larger set.

The question:

> If human concepts have a natural priority, *person* and *water* matter more than *kawa*, can we treat root assignment as a coding problem, giving the most fundamental concepts the shortest, cheapest syllables?

This was explicitly a return to **concept-first** design (English glosses as primitive IDs), but with Gen 3.1's distinctiveness layer and a new Huffman-like priority→cost mapping layered on top.

## Hypothesis

The working hypothesis was that root assignment could be framed as **optimal code allocation**:

1. Curate ~200 semantic primitives and rank them by **fundamentality priority** (1000 = most foundational).
2. Map priority linearly to a **target phonetic cost**, so high-priority concepts prefer shorter, simpler syllables; the same intuition as Huffman coding, where frequent symbols get shorter bit strings.
3. Build a ranked **syllable pool** (407 candidates in the first run) from Fonora-native onsets and vowels, ordered by tiered phonetic cost.
4. For each concept in priority order, score every unused syllable with:

- cost mismatch against the target (`|syllable_cost − target_cost| × 12`);

- **distinctiveness** penalties imported from Gen 3.1 (`tools/fonoran-gen3-distinctiveness.js`);

- **particle-flow** heuristics so roots do not collide with reserved grammar particles in `mi ___`, `mi ta ___`, and `mi na ___` frames;

- **compound-flow** heuristics so recently assigned roots concatenate without awkward repetition;

- **tier gates** blocking top-priority concepts from CVC or (in the first pool design) disyllabic templates.

5. Derive compounds by **flat concatenation** of primitive roots for concepts not in the primitive list, using definitions from `data/fonoran-stress-test-concepts.json` plus a small set of grammar-doc probe compounds (tribe, war, family, language, …).

The hypothesis was **not** that this inventory would become canonical. The generator report marks the output as experimental and "not committed as canonical" from the first run. The bet was narrower: if the numbers correlate cleanly, foundational concepts cluster at low phonetic cost, then algorithmic vocabulary generation might finally scale beyond Gen 3's 36-cell grid without abandoning Fonora-native phonotactics.

## Approach

The experiment shipped in commit `e8f81f1` (Jun 27, 2026), the same morning as the interpretive translator and semantic vocabulary scaffolding. The core artifacts:

| Artifact | Role |
| --- | --- |
| [`tools/fonoran-primitive-roots.js`](../tools/fonoran-primitive-roots.js) | Generator CLI (`npm run fonoran:primitive-roots`) |
| [`data/fonoran-primitive-roots-config.json`](../data/fonoran-primitive-roots-config.json) | Phonotactics, reserved particles, excluded syllables, embedded concept list (later moved to `fonoran-concept-inventory.json`) |
| [`data/fonoran-primitive-roots.json`](../data/fonoran-primitive-roots.json) | Generated inventory JSON |
| [`docs/fonoran-primitive-roots-report.md`](../archive/fonoran-primitive-roots-report.md) | Auto-generated metrics report, dated 2026-06-27 |

The config's stated philosophy pointed at [`docs/fonoran-grammar.md`](../docs/fonoran-grammar.md): invariant concept roots, grammar via particles, transparent compound trees, with phonetic strategy described as "Huffman-like: higher fundamentality → lower phonetic cost."

### Syllable pool design

The pool builder walks onset tiers in cost order:

1. Preferred onsets (`b d f g k l m n s t`) + vowels (`a` cheapest, then `e i o u`).
2. Secondary onsets (`h w y`).
3. Tertiary onsets (`p ch sh j r`), with `pi`/`po`/`pee`/`poo` blocked to avoid awkward English readings.
4. CVC extensions from coda-onset combinations.
5. In the **first run**, CV-CV disyllabic forms for lowest-priority concepts when the CV inventory exhausted (101 CVC, 62 CV, 37 CV-CV in the report).

Reserved particles in the initial run were **`mi`, `ta`, `na`**; excluded syllables included **`pi`, `pee`, `po`, `poo`**. The generator never assigns a reserved form to a lexical concept.

### Scoring reuse from Gen 3.1

Rather than invent a new readability metric, the generator imported `distinctivenessPenalty`, `distinctivenessScore`, `rhymeKey`, and `splitRoot` from the Gen 3.1 module. Duplicate roots, prefix overlaps, rhyme-class clustering, and onset similarity all carried the same weight structure Gen 3.1 had already tuned. The prior-generator table in the report records this explicitly: Gen 3 / 3.1 contributions were **partially adaptable**; the Huffman priority layer was **new**.

### Compound layer

Primitives received one syllable each. Everything else, tribe, war, language, memory, community, was built by joining primitive roots in composition order with no boundary markers. The report's grammar examples show the intended transparency:

| English | Fonoran | Composition |
| --- | --- | --- |
| tribe | **loba** | collective + person |
| war | **lobawi** | collective + person + conflict |
| family | **lofakba** | collective + bond + person |
| language | **senfakdaga** | signal + bond + group |

The same commit wired an import path (`tools/fonoran-primitive-roots-import.js`) so the lab Dictionary could load the generated vocabulary for review, treating the output as **reference data** to browse, not approved canon.

### Same-day follow-ups

Later on Jun 27, two related commits tightened the design without rescuing the premise:

- `a68945c`: **CV/CVC-only primitive rule**: disyllabic CV-CV templates were removed from the syllable pool; twelve assigned roots were migrated to CVC forms. Primitive roots must be atomic one-syllable atoms; multi-syllable shapes belong to compounds only.
- `90f3005` / `16e9150`: converged **`fonoran:build`** pipeline and editorial root assignment with human review gates, reusing priority ordering and distinctiveness scoring but not the Huffman inventory wholesale.

## Evaluation

There was no formal user study, campfire playtest, or cross-linguistic comprehension battery for this generator. Evaluation was **automated metrics plus manual reading** of the report and grammar examples; the same informal pattern as Gen 1–3.

### Automated checks (2026-06-27 report)

| Metric | Result |
| --- | --- |
| Primitives assigned | 200 |
| Total vocabulary | 281 (200 primitives + 81 compounds) |
| Unresolved compounds | 0 |
| Syllable pool size | 407 |
| Shortest root | **ba** (person) |
| Longest root | **dabe** (surface) |

**Priority ↔ phonetic cost correlation** was the headline success metric:

| Decile | Priority range | Avg phonetic cost | Sample roots |
| --- | --- | ---: | --- |
| 1 (top) | 981–1000 | **9.7** | ba, de, fi |
| 5 | 901–920 | 56.3 | kes, nel, sak |
| 10 (bottom) | 801–820 | **68.0** | nafe, lu, lel |

Top-decile concepts reliably received CV **`a`-vowel** forms; bottom decile absorbed CVC and (in the first pool) disyllabic templates. The correlation was monotonic enough to treat the Huffman mapping as **working math on curated priorities**.

### Informal questions the team was actually asking

- **Does the priority list feel defensible?** Fundamentality scores were author-curated, not corpus-derived; the report flags this as a tradeoff.
- **Do compounds read as trees or as mashups?** Probe pairs (person+collective → **balo**, water+fire → **wagu**) looked fine; longer grammar examples raised doubts.
- **Did grammar stay out of the lexicon?** Manual inspection said no, see Findings.
- **Is this safe to merge as canonical?** The report status line and archive docs answer no; the output predates semantic approval workflow.

Gen 3.1's memorability and parseability scores were **not** re-run on this inventory. The experiment inherited distinctiveness machinery but did not port Gen 3.1's full success-criteria table.

## Findings

### What worked

The **phonetic optimization layer behaved as designed**. Priority mapped to cost with a clean separation between top and bottom deciles. High-priority concepts received the shortest roots (`ba` = person, `de` = self, `fi` = do). Distinctiveness constraints prevented the worst rhyme clusters and particle collisions within a single automated pass. All 81 compound definitions in the stress-test set resolved; the mechanical concat layer did not leave dangling references.

The Gen 3.1 distinctiveness module proved **reusable outside DDA coordinates**. That reuse was real engineering value: later editorial tooling (`fonoran-root-sound-assign.js`, collision scoring in the converged build) kept the same penalty structure.

### What failed

The experiment failed on **premise and inventory design**, not on arithmetic.

**1. Grammar leaked into the lexicon.** Concepts like **`because` → `do`**, **`with` → `fet`**, and **`without` → `gam`** became primitive roots. That directly contradicts the grammar spec's later direction: causal connectives, accompaniment, and negation belong in a closed particle class, not in the open root inventory. RN-14 documents the cleanup; the Huffman run shows why that cleanup became necessary.

**2. Compounds were flat and unteachable at scale.** Transparent concatenation produced forms like **`lobawi`** (collective + person + conflict) for "war" and **`senfakdaga`** for "language." The semantic tree is visible if you already know every piece, but the character of the failure is **depth without hierarchy**: intermediate concepts are not grouped; everything is one string. The semantic foundation doc (written the next day) explicitly prefers hierarchical compounding (`community + identity → tribe`) over flattening.

**3. Sounds were assigned before meanings were approved.** This was the structural mistake. Two hundred English glosses received phonetic forms in one deterministic pass from a curated priority list nobody had signed off on as *the* primitive set. The generator could not know that **`cause`**, **`effect`**, and **`void`** would later be demoted, or that **`walk`** and **`useful`** were poor primitives, because semantic review had not happened yet. [`docs/fonoran-semantic-foundation.md`](../archive/fonoran-semantic-foundation.md) opens by superseding this tooling for exactly that reason: "That tooling assigned phonetic forms before semantic approval. **This foundation starts from concepts only.**"

### Provisional verdict

The Huffman run was **never adopted as canonical**. It remains archived reference data: useful for comparing automated allocation against human-approved roots, not for speaking Fonoran. The elegant correlation was real; the workflow order was backwards.

## What Changed

Several mechanisms survived; the inventory and workflow did not.

**Survived into current architecture:**

- **Distinctiveness scoring** from Gen 3.1, still imported by root-assignment tools.
- **Priority-ordered assignment**: higher-priority concepts get first pick of syllables, now operates inside the editorial pipeline with human gates, not as a one-shot Huffman dump.
- **Reserved particle lists** and excluded syllables in [`data/fonoran-primitive-roots-config.json`](../data/fonoran-primitive-roots-config.json) (expanded later as the particle inventory matured).
- **CV/CVC-only primitive rule** (`a68945c`), enforced at build time in `fonoran-build.js`.
- The **fundamental experience test** and grammar-particle separation, formalized after this failure.

**Superseded:**

- The ~200-gloss English primitive list as canonical inventory.
- Flat compound concatenation without hierarchical concept trees.
- Treating author-curated "fundamentality" as sufficient semantic grounding.
- CV-CV primitive templates (removed same day as the first run).

**Later notes in sequence:**

- **RN-11: The irreducible dimensions of meaning** (Jun 28): reversed the order: ~99 semantic dimensions chosen by the fundamental experience test, **phonetics deliberately deferred**.
- **RN-13: Concepts are canonical, sounds are editorial proposals** (Jun 28): converged pipeline where algorithms propose spellings and humans approve; all root candidates gated before lock-in.
- **RN-14: Grammar as particles, not words** (Jun 29): evicted `because`, `with`, and similar items from the root lexicon into closed-class particles; reached 100% translator coverage once grammar was factored out.
- **RN-12: The campfire test (communication over correctness)** (Jun 30): reframed success as recoverable meaning, demoting generators (including this one) to advisors rather than oracles.

The generator archive ([`docs/fonoran-generator-archive.md`](../archive/fonoran-generator-archive.md)) now lists this run as **superseded** between Gen 3.1 and the lab-first / editorial model documented in [`docs/fonoran.md`](../docs/fonoran.md).

## Open Questions

The Huffman experiment answered its narrow coding question and disqualified its own workflow:

- **Can priority-driven phonetic allocation scale if the concept set is wrong?** No: garbage-in produces well-compressed garbage. Curated priority does not substitute for semantic approval.
- **Where is the line between a root and grammar?** This run blurred it badly; RN-11 and RN-14 exist to draw that line permanently.
- **How should compounds be structured so a learner can recover meaning?** Flat concat is transparent on paper and opaque in practice; hierarchical trees and the campfire test became the next evaluation frame.
- **What is the right order of operations?** The recurring mistake across Gen 1, Gen 2, Gen 3, and this run was **sounds before settled meaning**. RN-11's open question: what are the actual dimensions of reality, not English vocabulary, from which compounds write themselves?, is the direct response.

## References

**Related commits**
- `e8f81f1`: add primitive-roots generator, report, config, and interpretive translator reference data (Jun 27, 2026)
- `a68945c`: enforce CV/CVC-only primitive root rule; remove CV-CV tier from generators (Jun 27, 2026)
- `90f3005`: add Word Generator and converged vocabulary build pipeline (Jun 27, 2026)
- `16e9150`: add editorial root generation workflow with collision and boundary scoring (Jun 27, 2026)
- `d31ae25`: restructure primitives around grammar particles and transparent compounds
- `5cfe28a`: reorient Fonoran around the communication experiment (Constitution)

**Documentation:** [`docs/fonoran-primitive-roots-report.md`](../archive/fonoran-primitive-roots-report.md), [`docs/fonoran-grammar.md`](../docs/fonoran-grammar.md), [`docs/fonoran-generator-archive.md`](../archive/fonoran-generator-archive.md)

**Interactive demo:** [Dictionary](/language#dictionary) (lab bucket; Huffman output importable for comparison only)

**Future research notes:** RN-11 (semantic foundation), RN-13 (editorial pipeline), RN-14 (grammar particles), RN-12 (campfire test / Constitution)
