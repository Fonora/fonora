# Fonoran Gen 3: Grid-Native Language Architecture

> **Archive — superseded direction.** Experimental generator, not the active workflow. See [fonoran.md](fonoran.md).
>
> The Gen 3 / DDA coordinate track (abstract, articulation-derived `⟨D,M,A⟩` semantics) is
> **demoted** under the [Fonoran Constitution](fonoran-constitution.md): roots are now
> organized by **human experience** and gated by the **campfire test**, and compounds are
> judged by whether another root-knower can recover the meaning — not by coordinate
> correctness. Kept for reference and DDA inference; not the production design.

> **Status:** experimental rebase, all prior Fonoran work (Gen 1 inventory, Gen 2 primitives, English-adjacent roots) is **disposable**  
> **Branch:** `feature/fonoran-language-experiment`  
> **Does not modify:** Fonora translator, phoneme pipeline, IPA mapping, sound grid, quiz, reader, or `language-rules.md`

For the live vocabulary you build by hand, use the [Fonoran language lab](fonoran.md) at `/fonoran/`, Gen 3 JSON here is **reference semantics** for DDA inference and the English meaning picker, not your working dictionary.

---

## 0. The Rebasing

Gen 1 asked: *can we build a semantic language on Fonora script?*  
Gen 2 asked: *can we generate roots without English borrowing?*

Both still started from **human concepts** (water, person, light) and assigned sounds.

Gen 3 asks a different question:

> **What kinds of meaning naturally emerge from the Fonora articulation grid itself?**

Assume no prior human language existed. Assume no word for *water* waiting to be filled. Begin with:

```
∋ ∩ ⌓ ∪ ⊃  , places
⌇ ⌀ ⏌ ᵔ ⚬  , modifiers
```

Words are **outputs**. Coordinates are **inputs**.

| Generation | Starting point | Direction |
| --- | --- | --- |
| Gen 1 | English-like roots | concept → word |
| Gen 2 | Human primitives + IE collision repair | concept → coordinates → word |
| **Gen 3** | **Articulation topology** | **coordinates → primitive → compound → familiar concept** |

---

## 1. Semantic Theory

### 1.1 Core premise

Fonora is not an alphabet. It is a **map of speech production**: a ordered path from inner source (throat) through articulation to outer interface (lips).

Gen 3 treats this map as a **semantic manifold**: every speech gesture occupies a position in articulatory space, and that position carries meaning **before** any word is chosen.

Language, in this experiment, is what happens when a community **names stable coordinates** and **composes** them.

### 1.2 What meaning is NOT

- Not a label for English nouns
- Not a translation table (Fonora symbol ↔ English word)
- Not phonesthetic coincidence with Latin/Greek/Germanic roots
- Not "what sound should represent water?"

### 1.3 What meaning IS

Meaning is **position** in a coordinate system built from:

| Dimension | Source | Question answered |
| --- | --- | --- |
| **Depth** | Place of articulation (1–5) | *Where in the production pipeline?* |
| **Mode** | Manner modifier | *What kind of dynamics?* |
| **Aspect** | Vowel class (⚬X) | *What quality qualifies the gesture?* |

A root is a **named stable coordinate**. A compound is a **path through coordinate space**. Familiar concepts like *river* or *planet* appear only at the **derivation layer**: never as primitives.

### 1.4 The lip-to-throat journey as ontology

Speech production moves **outward** from origin to interface. Gen 3 reads this direction as a semantic gradient:

```
ORIGIN (5) ──→ EMANATION (4) ──→ JUNCTION (3) ──→ INDEX (2) ──→ INTERFACE (1)
  potential         propagation        combination        selection        contact
  pre-form          field extension    structure          this-here        boundary
```

This is not "abstract → concrete." A **threshold** (interface + passage) is liminal and abstract-adjacent; **breath** (origin + flux) is concrete physiology. Depth encodes **topological role in production**, not a simple physical/abstract binary.

### 1.5 Hypotheses tested (not assumed)

These were design questions, not starting axioms:

| Question | Gen 3 finding |
| --- | --- |
| Does front-of-mouth imply nearness? | **Partially.** Place 2 = **index** (pinpoint), not proximity. Nearness is derived: `near` = index + packet + contact. |
| Does back-of-mouth imply distance? | **Partially.** Place 4 = **emanation** (field extension). Far = emanation + packet + field. Distance is a compound, not a place. |
| Does throat imply abstraction? | **No.** Throat = **origin** (generative source). Abstraction is coordinate-derived (e.g. `unknown` = origin + hollow + source). |
| Does friction imply transformation? | **Yes.** Friction = **flux**: continuous change without discrete jumps. |
| Does nasal imply containment? | **Yes.** Nasal = **hollow**: resonant interior, permeable cavity. |
| Does glide imply transition? | **Yes.** Glide = **passage**: between states, not either state. |

---

## 2. Articulation Meaning Map

### 2.1 Places: Depth axis (D)

| # | Symbol | Key | Name | Semantic core |
| ---: | --- | --- | --- | --- |
| 1 | ∋ | p | **interface** | Outer contact surface, where inner meets outer; boundaries, faces, thresholds |
| 2 | ∩ | t | **index** | Pinpoint selection, this-here, singularity, zero-dimensional designation |
| 3 | ⌓ | c | **junction** | Articulation/combination, where elements bind, pattern, compose |
| 4 | ∪ | k | **emanation** | Projection, field extension, propagation, reach from a center |
| 5 | ⊃ | h | **origin** | Generative source, breath, potential, pre-articulate emergence |

### 2.2 Manners: Mode axis (M)

| # | Symbol | Key | Name | Semantic core |
| ---: | --- | --- | --- | --- |
| - | (none) | - | **packet** | Discrete bounded unit, stasis with edges |
| 6 | ⌇ | b | **live** | Self-sustaining activation, agency without biology |
| 7 | ⌀ | d | **flux** | Continuous transformation, unbroken change |
| 8 | ⏌ | j | **hollow** | Resonant interior, cavity, collective volume |
| 9 | ᵔ | g | **passage** | Transition, path between states |

### 2.3 Vowel classes: Aspect axis (A)

Vowel (⚬) marks that a consonant skeleton is **qualified**. The qualifying glyph is itself an articulatory dimension:

| Aspect | Fonora | Roman | Semantic quality |
| --- | --- | --- | --- |
| contact | ⚬∋ | u | surface-touch; tactile presence |
| focal | ⚬∩ | ee | particular; indexed; this-one |
| struct | ⚬⌓ | i | relational; patterned; compositional |
| field | ⚬∪ | o | extended; distributed; spreading |
| source | ⚬⊃ | a | originary; potential; pre-formed |
| animated | ⚬⌇ | e | activated; will-bearing |
| turbulent | ⚬⌀ | ae | continuously changing |
| resonant | ⚬⏌ | oh | collective; cavity-resonating |

### 2.4 Grid gaps as semantic constraints

Fonora reserves throat+nasal and throat+glide (no defined phoneme). Gen 3 treats these gaps as **illegal coordinates**: the generator rotates manner/place until a defined cell is found. Gaps force diversity; they are features of the archaeology, not bugs.

---

## 3. Coordinate System (DDA)

Every Gen 3 root is fully explained by a **DDA triple**:

```
⟨D:depth, M:mode, A:aspect⟩
```

### 3.1 Notation examples

| Notation | Reading |
| --- | --- |
| `⟨interface, packet, focal⟩` | A bounded unit at the outer boundary, **limit, edge** |
| `⟨index, live, animated⟩` | An activated point, **agent** |
| `⟨emanation, flux, turbulent⟩` | Propagating continuous change, **flow** |
| `⟨origin, hollow, source⟩` | Generative interior absence, **unknown** |
| `⟨junction, passage, struct⟩` | Structured connection, **bond, path** |

### 3.2 Coordinate → phoneme (mechanical)

```
place  = depth_to_place[D]           → 1–5
manner = mode_to_manner[M]           → plain/voice/friction/nasal/glide
onset  = sound_grid[manner][place]   → p/t/ch/k/h, b/d/j/g/gh, …
vowel  = aspect_vowel[A]             → u/ee/i/o/a/e/ae/oh
root   = onset + vowel               → CV syllable
```

**Repair** (grid-native only): rotate manner → place → vowel until onset is non-null and root is unique. **No Indo-European lexicon repair.**

### 3.3 Compound notation

```
compound = root₁ + root₂ + …     (concatenation, general → specific)
```

Meaning of compounds is **compositional from coordinates**, not idiomatic:

```
flow + path  =  ⟨emanation,flux,turbulent⟩ + ⟨index,passage,struct⟩
             =  "continuous change along directed passage"
             →  river (derivation label only)
```

---

## 4. Root Generation System

### 4.1 Pipeline

```
┌─────────────────────────────────────────────────────────┐
│  DDA coordinate (from grid-native primitive definition) │
└──────────────────────────┬──────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Fonora sound grid lookup → onset + vowel → CV root     │
└──────────────────────────┬──────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Grid repair: null onset / duplicate → rotate M,D,A      │
└──────────────────────────┬──────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Named primitive with explainable coordinates           │
└──────────────────────────┬──────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Compounds → derivation labels (river, planet, …)       │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Implementation

| File | Role |
| --- | --- |
| [`data/fonoran-gen3-config.json`](../data/fonoran-gen3-config.json) | Articulation map, DDA axes, primitives, derivations |
| [`tools/fonoran-gen3.js`](../tools/fonoran-gen3.js) | Coordinate → root generator |
| [`data/fonoran-gen3-roots.json`](../data/fonoran-gen3-roots.json) | Generated output (`npm run fonoran:gen3`) |

### 4.3 Explainability requirement

Every root must satisfy: **given ⟨D,M,A⟩, a reader can derive the onset, vowel, and gloss without consulting English.**

Example, **`agent`** = `de`:

| Coordinate | Maps to | Phoneme |
| --- | --- | --- |
| D:index | place 2 | ∩ front tongue |
| M:live | voice | ⌇ |
| A:animated | vowel e | ⚬⌇ |
| → | voice + front | **d** + **e** = **de** |

Gloss: *activated locus; point that acts*, not "person," not "human."

---

## 5. Primitive Inventory

**36 grid-native primitives.** None are English nouns. Categories emerge from DDA topology, not modern taxonomy.

### 5.1 Interface depth (D:interface)

| ID | Coordinates | Root | Gloss |
| --- | --- | --- | --- |
| bound | ⟨interface, packet, focal⟩ | pee | limit; edge; termination |
| surface | ⟨interface, packet, contact⟩ | pu | contact plane; outer face |
| threshold | ⟨interface, passage, focal⟩ | wee | liminal crossing; doorway |
| envelope | ⟨interface, hollow, contact⟩ | mu | wrapping containment at boundary |
| material | ⟨interface, packet, contact⟩* | bu | stuff-at-boundary |

\* `material` shares coordinates with `surface` but differs in gloss emphasis; repair diverges onset (voice vs plain).

### 5.2 Index depth (D:index)

| ID | Coordinates | Root | Gloss |
| --- | --- | --- | --- |
| here | ⟨index, packet, focal⟩ | tee | indexical locus; this-point |
| mark | ⟨index, flux, focal⟩ | see | intentional sign |
| probe | ⟨index, passage, focal⟩ | lee | directed extension from a point |
| agent | ⟨index, live, animated⟩ | de | activated locus; point that acts |
| identity | ⟨index, packet, struct⟩ | ti | discrete self-same |
| path | ⟨index, passage, struct⟩ | li | directed passage |
| near | ⟨index, packet, contact⟩ | tu | proximal index |
| motion | ⟨index, passage, animated⟩ | le | index in transit |
| known | ⟨index, packet, focal⟩* | dee | indexed certainty |

### 5.3 Junction depth (D:junction)

| ID | Coordinates | Root | Gloss |
| --- | --- | --- | --- |
| bond | ⟨junction, passage, struct⟩ | ri | structural connection |
| form | ⟨junction, packet, struct⟩ | chi | articulated shape |
| weave | ⟨junction, flux, struct⟩ | shi | interlaced change |
| lattice | ⟨junction, hollow, struct⟩ | ñi | organized cavity |
| container | ⟨junction, hollow, resonant⟩ | ñoh | held interior |
| change | ⟨junction, flux, turbulent⟩ | shae | state transformation |
| group | ⟨junction, hollow, resonant⟩* | roh | collective cavity |
| static | ⟨junction, packet, struct⟩* | ji | without change; stable |

### 5.4 Emanation depth (D:emanation)

| ID | Coordinates | Root | Gloss |
| --- | --- | --- | --- |
| field | ⟨emanation, packet, field⟩ | ko | extended presence |
| wave | ⟨emanation, flux, field⟩ | xo | propagating disturbance |
| pulse | ⟨emanation, live, field⟩ | go | rhythmic activation |
| reach | ⟨emanation, passage, field⟩ | yo | extension toward |
| signal | ⟨emanation, packet, focal⟩ | kee | discrete emission |
| flow | ⟨emanation, flux, turbulent⟩ | xae | unbounded change |
| collective | ⟨emanation, hollow, field⟩ | ngo | many-as-one field |
| far | ⟨emanation, packet, field⟩* | kho | distal field |

### 5.5 Origin depth (D:origin)

| ID | Coordinates | Root | Gloss |
| --- | --- | --- | --- |
| source | ⟨origin, packet, source⟩ | ha | generative point |
| breath | ⟨origin, flux, source⟩ | kha | pre-articulate stream |
| will | ⟨origin, live, source⟩ | gha | originary activation |
| void | ⟨origin, hollow, source⟩* | pa | inner absence |
| cycle | ⟨origin, passage, resonant⟩* | hoh | return path |
| unknown | ⟨origin, hollow, source⟩* | ta | opaque origin |

\* Repair steps applied, throat+nasal/glide gaps or duplicate collision within inventory. Coordinates in config remain authoritative; phonetic form is grid-resolved.

### 5.6 Primitive families (orthogonal groupings)

These cross-cut depth, useful for derivation, not for storage:

| Family | Members | Coordinate theme |
| --- | --- | --- |
| **Boundary** | bound, surface, threshold, envelope | interface |
| **Pointer** | here, mark, probe, near, known | index + focal/contact |
| **Connection** | bond, path, weave, passage-mode roots | junction/index + passage |
| **Field** | field, wave, reach, collective, far | emanation |
| **Interior** | container, lattice, group, hollow-mode | hollow |
| **Change** | flow, change, weave, flux-mode | friction |
| **Origin** | source, breath, will, void, unknown | origin |
| **Agency** | agent, will, pulse, motion | live + animated/source |

---

## 6. Example Derivations

Familiar concepts appear **only here**: as composition of grid-native primitives.

| Concept | Composition | Compound | Coordinate gloss |
| --- | --- | --- | --- |
| **river** | flow + path | **xaeli** | turbulent flux along directed passage |
| **planet** | bound + field + motion | **peekole** | edge + extended presence + transit |
| **speaker** | signal + agent | **keede** | discrete emission + activated locus |
| **language** | signal + bond + group | **keeriroh** | emission + connection + collective cavity |
| **memory** | mark + container + static | **seeñohji** | sign + held interior + stability |
| **storm** | wave + change + field | **xoshaeko** | propagating flux + transformation + field |
| **community** | group + bond + identity | **rohriti** | collective + connection + self-same |
| **question** | probe + unknown | **leeta** | directed extension + opaque origin |

### 6.1 Derivation walkthrough: planet

**Not primitive.** Decomposed:

```
bound    = ⟨interface, packet, focal⟩   = pee   "edge"
field    = ⟨emanation, packet, field⟩   = ko    "extended presence"
motion   = ⟨index, passage, animated⟩   = le    "index in transit"

planet   = pee + ko + le                = peekole
```

A speaker encountering `peekole` can parse:
1. **pee**: there is a boundary/limit
2. **ko**: it extends as a field
3. **le**: the indexed point moves in passage

→ a bounded body moving through space. The label *planet* is English annotation only.

### 6.2 Derivation walkthrough: speaker

```
signal   = ⟨emanation, packet, focal⟩   = kee   "discrete emission"
agent    = ⟨index, live, animated⟩      = de    "activated locus"

speaker  = kee + de                     = keede
```

Not *person* + *speech*. **Emission + activation**: works for human speaker, animal call, or mechanical signal source.

### 6.3 What cannot be primitive in Gen 3

| Forbidden primitive | Instead derive from |
| --- | --- |
| water | flow + material, or flow + container |
| tree | form + source + material |
| house | container + static + envelope |
| government | bond + group + will |
| family | group + identity + bond |
| sun | source + pulse + field |
| fire | flux + emanation + animated |

---

## 7. Relationship to Prior Generations

| Asset | Gen 3 disposition |
| --- | --- |
| `data/fonoran-roots.json` (Gen 1) | **Removed**: archived in [fonoran-generator-archive.md](fonoran-generator-archive.md) |
| `data/fonoran-gen2-*.json` | **Removed**: archived in [fonoran-generator-archive.md](fonoran-generator-archive.md) |
| `tools/fonoran-generator.html` | **Removed**: Gen 1 UI sandbox |
| `docs/fonoran-language.md` | **Removed**: see archive doc |
| `docs/fonoran-gen2.md` | **Removed**: see archive doc |

Gen 3 is the current experimental authority for **grid-native semantics**. Production language building uses the lab at `/fonoran/` ([fonoran.md](fonoran.md)).

---

## 8. Scale and Next Steps

### 8.1 Scaling without English

The DDA cube has **5 × 5 × 8 = 200** coordinate cells; ~25 are phonetically null (throat gaps). The generator can enumerate all valid cells as roots without ever referencing human vocabulary.

Compound templates multiply expressivity:

```
200 roots × 200 roots = 40,000 two-root compounds
+ grammar-vowel inflection (from Gen 1 mechanism, reconnected to Gen 3 roots)
= hundreds of thousands of explainable words
```

### 8.2 Research backlog

1. **Fonora symbol roots**: map CV romanization to ⚬X consonant+vowel spellings
2. **Full cell enumeration**: generate all 175+ valid grid cells, not just 36 named primitives
3. **Derivation grammar**: rules for which compound orders are legal
4. **Gen 3 generator UI**: read-only explorer for coordinates and compounds
5. **Vowel-as-grammar reconnection**: inflection vowels (a/e/i/o/u roles) on grid-native roots

---

## 9. Running the Generator

```bash
npm run fonoran:gen3                      # write data/fonoran-gen3-roots.json
node tools/fonoran-gen3.js --derivations  # print example compounds
node tools/fonoran-gen3.js --json          # full output to stdout
```

Edit primitives or the articulation map in `data/fonoran-gen3-config.json`, then re-run. The inventory is **coordinate-derived archaeology**: not a dictionary to be edited by hand.

---

## 10. Human Readability Review

**Live lab:** `/fonoran/` → **Health** runs the same scoring layer on your bucket (learnability, parseability, warnings).

**Frozen Gen 3 reference** (for generator archaeology only):

| Resource | Purpose |
| --- | --- |
| `/fonoran/` Health panel | Live bucket scores + DDA summary |
| `npm run fonoran:gen3:audit` | Regenerate Gen 3 audit → `reports/fonoran-gen3-human-readability-audit.md` |

---

## 11. Summary

Gen 3 completes the inversion:

| Old question | New question |
| --- | --- |
| What sound represents water? | What coordinates describe flowing passage along a directed path? |
| What is the word for person? | What is an activated indexical locus? |
| How do we avoid English roots? | How does meaning fall out of the grid? |

**Start from the grid. Name the coordinates. Compose the world.**
