# Grammar

> **Read the research.** Why grammar lives in closed-class particles instead of the lexicon is told in the research notebook: [RN-14 · Grammar as particles, not words](/research/notes/grammar-particles).

> **Status**: Living specification. This is the authoritative reference for humans and the future Fonoran Translator. Sections marked *Under Development* are intentional placeholders, not omissions.
>
> **Read [the Fonoran Constitution](fonoran-constitution.md) first.** It states what
> Fonoran is *for*: an experiment in whether people from different native languages can
> communicate by combining a small shared set of roots. Compounds are **meaning-attempts**,
> not canonical answers; the test for any expression is *"if someone only knew the roots,
> would this probably help them recover the intended meaning?"* This grammar describes the
> minimal machinery that makes those attempts mutually intelligible.

Fonoran is a language of **concepts**.

Every lexical item represents a semantic concept. Grammar exists only to describe **relationships between concepts**. Complexity should live in semantic composition, not grammatical exceptions.

Roots are organized by **human experience** (survival/body, space/motion, social, emotion,
time, thinking, abstract) and gated by the **campfire test**: *could two strangers stranded
with no common language plausibly need this root in their first week?* If yes, it belongs in
the communicative core; if no, it belongs in the extended or complete vocabulary. See the
[constitution](fonoran-constitution.md) for the tiered language model (~50 core → ~100
extended → unlimited).

### The fundamental experience test

> **A primitive concept should represent a fundamental human experience that cannot be naturally expressed using simpler Fonoran concepts.**

This is inspired by how toddlers learn language, but it is **not** a literal toddler vocabulary test. A two-year-old may not yet grasp **equal**, **before**, or **remember**, yet every language needs them. The test is whether *any* speaker could naturally understand the concept only after knowing simpler Fonoran roots, not whether a child already has the English word.

| Question | If yes → | If no → |
| --- | --- | --- |
| Can this be naturally expressed using simpler Fonoran concepts? | **Compound** or **grammar particle** | Candidate primitive |
| Is this a dimension of reality (not a word slot)? | Strong primitive signal | Reconsider |
| Is this causal linking (because / therefore)? | **Grammar particle** | n/a |

```example
ben ba

collective person

↓

benba (tribe)
```

```example
je + cha

big + change

↓

jecha (grow)
```

```example
hu + di

know + before

↓

hudi (remember)
```

```example
ye (water)

(no simpler Fonoran explanation)

↓

primitive
```

The full proposed primitive inventory lives in [fonoran-semantic-foundation.md](fonoran-semantic-foundation.md).

Read the examples first. You can already start understanding this language.

## At a glance

Fonoran grammar **minimizes lexical categories**. Every lexical item is an **invariant concept**; its role comes from **grammar particles** and **sentence position**, not from noun, verb, or adjective labels.

For the *why* — the communication experiment, campfire test, meaning-attempts, and tiered vocabulary — read **[the Fonoran Constitution](fonoran-constitution.md)**. The **Rules** below are the authoritative syntax reference.

| Idea | Rule |
| --- | --- |
| Concepts, not parts of speech | [Rule 1](#rule-1-concepts-are-universal) |
| Words never inflect | [Rule 2](#rule-2-words-never-change) |
| Grammar uses particles | [Rule 3](#rule-3-grammar-uses-particles) |
| Fixed default order | [Rule 4](#rule-4-sentence-order) |
| Meaning through composition | [Rule 5](#rule-5-semantic-compounding) |
| English → Fonoran compiler | [Rule 7](#rule-7-translator-architecture) |

**Present has no time particle.** Past uses **ta**, future **sa** (*Under Development*). The event concept stays identical across tenses: `mi bem` / `mi ta bem` / `mi sa bem` → I love / loved / will love.

Modifier chains use the same invariant spellings — **bem ba** (loving person), **bem ben** (loving community), **bem nal** (conflict about love) — with reading fixed by order and context. Compounds like **benba** (collective + person) and **benbanal** (tribe + conflict) preserve their ancestry in the spelling; see [Rule 5](#rule-5-semantic-compounding).

## Rule 1: Concepts Are Universal

Every word is simply a **concept**.

| Concept | Meaning |
| --- | --- |
| **ba** | person |
| **nal** | conflict |
| **ben** | collective |
| **bem** | love |
| **benba** | tribe |
| **benbanal** | war |

These are not permanently nouns or verbs. Their role depends on **sentence position** and **surrounding particles**.

```example
ba nal

person conflict

↓

a person's conflict
```

```example
nal ba

conflict person

↓

conflict involving a person
```

Same concepts. Different order. Different relationship.

## Rule 2: Words Never Change

Fonoran has no conjugation, declension, grammatical gender, plural endings, or case endings.

A word is always written the same way.

**benbanal** always remains **benbanal**.

```example
mi ta benbanal
mi benbanal
benba benbanal

↓

I fought.
There is war.
The tribe is at war.
```

Present sentences omit the time particle. **benbanal** never changes.

Time, plurality, and relationships are expressed through **particles** and **word order**, not through mutating the concept itself.

## Rule 3: Grammar Uses Particles

Instead of modifying words, Fonoran uses small **invariant particles** to mark grammatical relationships.

The particle inventory is not finalized. Placeholders below show the intended architecture.

### Tense

Present is **not** a particle. It is the default when no time marker appears.

| Tense | Particle | Status |
| --- | --- | --- |
| Past | ta | Under Development |
| Future | sa | Under Development |

### Other particles

The full inventory (forms, roles, English triggers) lives in [../data/fonoran-grammar-particles.json](../data/fonoran-grammar-particles.json). The particle class is **closed and minimal**: a word is a particle only if it is genuinely grammatical (cannot be a lexical concept) *and* is sanctioned here or wired in the translator.

| Role | Particle | Status |
| --- | --- | --- |
| Negation | no | Active |
| Affirmation | ya | Active |
| Question (marker) | wo | Active |
| Conditional (if) | von | Active |
| Interrogative (what) | vus | Active |
| Interrogative (who) | zas | Active |
| Interrogative (when) | zes | Active |
| Interrogative (where) | zis | Active |
| Interrogative (why) | zos | Active |
| Interrogative (how) | zus | Active |
| Focus (only) | vat | Active |
| Focus (also) | vet | Active |
| Focus (even) | vit | Active |
| Possession | TBD | Under Development |
| Comparison | TBD | Under Development |

Particles are **reserved**: the root generator never assigns particle forms to a lexical concept. The reserved set is `mi`, `ta`, `sa`, `no`, `ya`, `wo` plus the `v*`/`z*` particle forms enumerated in [../data/fonoran-primitive-roots-config.json](../data/fonoran-primitive-roots-config.json) (`reserved_particles.forms`).

**Grammar vs. lexicon.** Spatial and relational meaning is *lexical*, not grammatical: "in/inside", "here/there", and the three sense of "toward" (`up`/`dal`, `down`/`nat`, `reach`/`ni`), plus `near`/`far`, are **concepts/roots**, never particles. Likewise, personal pronouns other than `mi` (you/we/they/he/she/it) resolve lexically, and conjunctions (`and`/`or`/`but`/`because`) are handled structurally as clause connectives rather than as emitted particles. This keeps the particle class small and prevents it from shadowing the lexicon.

Polarity is grammar, not vocabulary — **false** is `no` + **true**, **different** is `no` + **same**. Such antonyms are *not* roots and *not* compounds; they are produced at the particle layer.

### Particle placement and quantifiers

Particles occupy fixed positions within the sentence skeleton; they never fuse into adjacent spellings.

- **Negation** sits between Time and Event: `Subject · Time · no · Event · …` (e.g. *I never said that* -> `mi no` + event). It is clause-scoped.
- **Question marker** `wo` is clause-initial; a specific interrogative particle (e.g. `zes` for *when*) fills its slot in addition to the marker.
- **Focus** particles (`vat`/`vet`/`vit`) attach as modifiers next to the element they focus.
- **Quantifier pronouns compose** rather than taking their own root: *nobody* = `no` + **person**, *nothing* = `no` + **thing**, *everyone* = **all** + **person**, *everything* = **all** + **thing**, *someone* = **some** + **person**.

Even before the full inventory exists, you can already read sentences by treating each slot as a labeled relationship:

```example
mi bem ba

↓

I love someone.
```

Particles are separate from concepts. They never fuse into word spellings.

## Rule 4: Fixed Word Order

Fonoran recommends a **default sentence structure**:

```text
Subject · Time · Event · Object · Modifiers
```

```mermaid
flowchart LR
  S["Subject"]
  T["Time"]
  E["Event"]
  O["Object"]
  M["Modifiers"]
  S --> T --> E --> O --> M
```

**Why this order:**

- **Predictable**: every clause follows the same skeleton
- **Machine friendly**: parsers do not need probabilistic reordering
- **Easy to learn**: one template instead of many constructions
- **Easy to parse**: slot-based analysis maps cleanly to a semantic graph

```example
benba benbanal

↓

The tribe is at war.
```

```example
mi bem benba

↓

I love the tribe.
```

```example
mi sa bem benba

↓

I will love the tribe.
```

Modifiers attach to the nearest eligible slot unless a future particle specifies otherwise (*Under Development*).

## Rule 5: Semantic Compounding

Almost every complex concept should be expressed through **composition**.

**Step 1: combine primitives**

| | |
| --- | --- |
| **ben** | collective |
| **ba** | person |

↓

| | |
| --- | --- |
| **benba** | tribe |

**Step 2: extend the tree**

| | |
| --- | --- |
| **benba** | tribe |
| **nal** | conflict |

↓

| | |
| --- | --- |
| **benbanal** | war |

Every derived word **preserves its ancestry**. Words form a semantic tree rather than existing independently.

```mermaid
graph TD
  ben["ben\ncollective"]
  ba["ba\nperson"]
  benba["benba\ntribe"]
  nal["nal\nconflict"]
  benbanal["benbanal\nwar"]
  ben --> benba
  ba --> benba
  benba --> benbanal
  nal --> benbanal
```

Compounding rules for the translator: prefer the **shortest transparent path** through approved concepts; omit concepts implied by human experience unless emphasis or disambiguation is needed (**semantic economy**); reject opaque shortcuts that break the tree (*implementation Under Development*).

### Compound Boundary Constraint

> **A valid compound may not join two morphemes when the final consonant of the left morpheme is identical to the initial consonant of the right morpheme. Fonoran does not collapse, lengthen, or silently alter boundary sounds. If such a boundary would occur, the compound candidate is invalid and must be regenerated or assigned different roots.**

This rule preserves Fonoran's core promise: **what you hear = what you write = what you look up**. If a spoken compound sounded like "bemam" a listener would naturally write "bemam", but the dictionary would store "bemmam". That gap violates spelling stability.

| Left | Right | Boundary | Valid? | Reason |
| --- | --- | --- | --- | --- |
| bem | mam | m + m | **No** | identical consonants |
| kal | lem | l + l | **No** | identical consonants |
| bem | lek | m + l | Yes | different consonants |
| ben | mam | n + m | Yes | different consonants |
| ba | so | a + s | Yes | vowel–consonant boundary |
| so | a | o + a | Yes | vowel–vowel boundary |

**This is a generation constraint, not a pronunciation rule.** Fonoran never collapses, lengthens, or silently alters boundary sounds. The constraint prevents generating compounds that would require hidden spelling or pronunciation exceptions.

Multi-part compounds must satisfy the constraint at **every boundary**, not just the first one.

The constraint is enforced at:
- **Root generation** (`fonoran-root-boundary-score.js`) — when a root is assigned a spelling, candidate forms are scored against the root's likely compound partners; forms that would create boundary collisions are penalized and any remaining risk is surfaced as a warning in Review (`compound_flow_score` + `boundary_warnings`).
- **Build time** (`npm run fonoran:build`) — curated compounds that violate it are dropped with a clear reason.
- **Word composer UI** — saving is blocked and the violation is shown inline.
- **API** (`POST /api/fonoran/lab/compounds`) — the server rejects the request with a descriptive error.

### Semantic economy

Fonoran compounds should contain only the concepts necessary to distinguish their intended meaning. Concepts that are naturally implied by human experience should be omitted unless the speaker wishes to emphasize or disambiguate them.

The goal is not to create exhaustive definitions, but to represent the **minimum semantic ingredients** required to identify a concept.

```example
against + air

↓

air resistance, wind resistance, drag

(motion is implied — move is unnecessary)
```

```example
against + move + water

↓

resistance encountered while moving through water (hydrodynamic drag)

(move intentionally narrows the meaning)
```

This gives the language a natural property:

- **Fewer roots** → broader, more general concepts
- **More roots** → narrower, more precise concepts

This principle should guide both manual word creation and future automated compound generation.

## Rule 6: Meaning Is Visible

When someone learns **ben** (collective) and **ba** (person), they should naturally understand **benba** (tribe) without memorization.

```example
ben ba

collective person

↓

benba (tribe)
```

```example
benba nal

tribe conflict

↓

benbanal (war)
```

As vocabulary grows, **understanding accelerates**. Each new root unlocks many compounds, and each compound reinforces the roots below it.

Teaching order should follow the semantic tree (roots, then compounds, then sentences), not frequency lists copied from English.

## Rule 7: Translator Architecture

The Fonoran Translator must **not** perform literal word substitution.

English surface forms diverge. Meaning converges. The translator **compiles meaning into Fonoran**.

```mermaid
flowchart TD
  EN["English"]
  ME["Meaning extraction"]
  SG["Semantic graph"]
  PC["Primitive concepts"]
  CC["Compound construction"]
  GP["Grammar particles"]
  FO["Fonoran sentence"]
  EN --> ME --> SG --> PC --> CC --> GP --> FO
```

**Pipeline stages:**

1. **English**: arbitrary phrasing, idioms, reorderings
2. **Meaning extraction**: normalize to language-neutral propositions
3. **Semantic graph**: entities, events, relations, time, negation
4. **Primitive concepts**: map graph nodes to approved Fonoran roots
5. **Compound construction**: build or select transparent compounds for complex nodes
6. **Grammar particles**: attach past (**ta**), future (**sa**), question, possession, etc. (*Under Development*). **Omit time particles for present.**
7. **Fonoran sentence**: emit fixed-order surface string

Full implementation spec: [fonoran-interpretive-translator.md](fonoran-interpretive-translator.md).

**Default tense rule:** if the semantic frame has no time particle, the translator treats the sentence as **present** (or contextually current). Only **ta** (past) and **sa** (future) appear on the surface.

Whenever a concept cannot yet be expressed in Fonoran, the translator must show it in **red**. Never silently omit it. Never substitute English without marking it as unresolved.

> Red words indicate concepts that do not yet exist in the Fonoran lexicon.

Unknown concepts are valuable. They reveal where the language needs to grow. As the language grows, fewer words will appear in red.

The translator should function as a **language development tool**, not just a translation tool.

### Resolution cascade & honest gaps

Each English token is resolved through an ordered cascade. The first legitimate
match wins; if none matches, the token is an **honest gap** (red) — the
translator never fabricates a spelling.

| Tier | `resolution_kind` | Quality | Notes |
| --- | --- | --- | --- |
| Curated alias | `direct` | pass | Concept id, localized alias, or lab meaning/alias. |
| Interpretation rule | `interpreted` | pass | Tense lemmas, idioms, spatial/relational frames, pronoun hints. |
| Nearest existing root | `semantic` | review | A real WordNet hypernym that already has a root. Single concept only. |
| Weak (gloss) alias | `alias_weak` | review | Alias derived from a concept's *description* text (low confidence). |
| Unresolved | `unknown` | gap | No legitimate match — surfaces in red for the designer to grow a root. |

**Strong vs weak aliases.** An alias is **strong** when it comes from a curated
source: the concept id, its localized aliases, or a lab sound's meaning/curated
aliases. An alias is **weak** when it is merely a token from a concept's
*description gloss* (e.g. `dark`'s gloss "no light" leaks the token `light`).
Weak aliases can **never shadow** a strong root, regardless of registration
order, and they resolve as `alias_weak` (low confidence) so the quality gate can
flag mismatches like the old `travel → path` and `light → dark` errors.

**No generated guesses.** The translator does not invent multi-root compounds
for unknown words. The standalone Word Generator has been removed; the only
non-curated tier is the single-concept `semantic` fallback to an *existing*
root. Anything else is an honest gap.

**Meaningful function words.** Relational words that carry meaning are not
blanket-skipped: e.g. `from` resolves to the `source` root rather than being
dropped. Only truly contentless articles/possessives/conjunctions are skipped.
Second-person **`you`** resolves lexically to the **`addressee`** root (**`ti`**), symmetric to **`self`** (**`de`**) for the speaker.

### Golden regression suite

[../data/fonoran-translation-tests.json](../data/fonoran-translation-tests.json)
is a **golden corpus**: ~100 canonical English sentences (11 levels), each with
the exact `fon` (roman) output the project commits to, plus a `note` recording
known gaps/decisions. It is the permanent regression snapshot — run it on every
grammar, root, or rule change:

```bash
npm run test:translator          # assert: FAIL on any drift or new gap
npm run test:translator:update   # accept current output as the new golden baseline
node scripts/fonoran-translation-gaps.js   # full human report (coverage, gaps, collapses)
```

The runner also grades resolution quality (pass / review / gap) and reports
**concept collapses** — distinct English words sharing one root (e.g.
`man`, `woman`, `baby → ba`) — so the designer can decide whether a concept
needs its own root. `npm test` runs this suite automatically.

### Example: love and family

```pipeline
English:
I love my family.

Semantic:
I
love
family

Fonoran:
mi
bem
tatba
```

**family** compiles to **tatba** (bond + person). No time particle: present by default. Every slot resolves through known concepts or transparent compounding.

```example
tat ba

bond person

↓

tatba (family)
```

### Example: full compile

```pipeline
English:
The tribe is at war.

Semantic:
tribe
war

Fonoran:
benba
benbanal
```

Every known concept compiles into Fonoran. **benba** (tribe), **benbanal** (war). No time particle: the tribe **is at war now**. Nothing hidden. Nothing borrowed from English without marking it.

This architecture allows multiple English expressions to converge into the **same underlying semantic representation**, then diverge again only at the particle layer when needed.

**Non-goals for v1:**

- word-for-word English order preservation
- inflection mimicry
- opaque lexical lookup when a compound path exists

## Semantic coordinates (archive / DDA)

> **Constitution demoted the DDA coordinate track** as production design. Roots are organized by human experience and the campfire test; compounds are judged by recoverable meaning, not coordinate correctness. This section documents the **legacy internal mapping** still used by the lab's DDA inference (Advanced tab).

Each word may carry internal **depth**, **mode**, and **aspect** coordinates — a compact address in semantic space. They are assigned automatically (**DDA inference**) from sound shape and English gloss match, blended for compounds, with status `pending | inferred | confirmed | stale`. You do not edit them in normal workflow; re-run DDA from the Advanced tab when coordinates go stale after a meaning or recipe change. The word detail view shows the three values plus how they were inferred.

Experiment history: [RN-08 · Meaning from coordinates](/research/notes/dda-coordinates) · [fonoran-gen3.md](fonoran-gen3.md).

## Future Work

The following topics are **intentionally incomplete**. They will extend this specification without breaking Rules 1 through 7.

- Pronouns
- Aspect
- Negation
- Questions
- Comparisons
- Numbers
- Quantifiers
- Time expressions
- Locations
- Conditionals
- Relative clauses

Contributions should preserve: invariant words, particle-based grammar, fixed default order, visible semantic compounding, and semantic economy in compounds.

*Related: [Fonoran language lab](fonoran.md) · [Semantic foundation](fonoran-semantic-foundation.md) · [Dictionary](/language#dictionary) · [Learn Fonoran](/language)*
