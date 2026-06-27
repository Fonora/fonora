# Grammar

> **Status**: Living specification. This is the authoritative reference for humans and the future Fonoran Translator. Sections marked *Under Development* are intentional placeholders, not omissions.

Fonoran is a language of **concepts**.

Every lexical item represents a semantic concept. Grammar exists only to describe **relationships between concepts**. Complexity should live in semantic composition, not grammatical exceptions.

### The fundamental experience test

> **A primitive concept should represent a fundamental human experience that cannot be naturally expressed using simpler Fonoran concepts.**

This is inspired by how toddlers learn language, but it is **not** a literal toddler vocabulary test. A two-year-old may not yet grasp **equal**, **before**, or **remember**, yet every language needs them. The test is whether *any* speaker could naturally understand the concept only after knowing simpler Fonoran roots, not whether a child already has the English word.

| Question | If yes → | If no → |
| --- | --- | --- |
| Can this be naturally expressed using simpler Fonoran concepts? | **Compound** or **grammar particle** | Candidate primitive |
| Is this a dimension of reality (not a word slot)? | Strong primitive signal | Reconsider |
| Is this causal linking (because / therefore)? | **Grammar particle** | n/a |

```example
kaso sha

love collective

↓

kasosha (family)
```

```example
move + fast

↓

run
```

```example
know + before

↓

remember
```

```example
water

(no simpler Fonoran explanation)

↓

primitive
```

The full proposed primitive inventory lives in [fonoran-semantic-foundation.md](fonoran-semantic-foundation.md).

Read the examples first. You can already start understanding this language.

## Core Philosophy

> **Fonoran minimizes lexical categories and represents sentences as relationships between invariant concepts.**

Fonoran grammar deliberately avoids copying English or traditional linguistic categories. Every lexical item is an **invariant concept**. Its role in a sentence comes from **grammar particles** and **sentence position**, not from noun, verb, or adjective labels.

### Concepts instead of parts of speech

There are no permanent nouns, verbs, or adjectives. Only concepts that take on roles from context.

```example
mi kaso

↓

I love.
```

- **mi** = I (placeholder pronoun, *Under Development*)
- **kaso** = love

Notice that **love never changes form**.

English requires: love, loves, loved, loving.

Fonoran simply uses **kaso**. Grammar communicates the relationship, not the word itself.

```example
mi ta kaso

↓

I loved.
```

- **ta** = past (*Under Development*)
- **kaso** never changes

```example
mi na kaso

↓

I will love.
```

- **na** = future (*Under Development*)
- The event concept stays identical regardless of tense

```example
mi ta shakafa

↓

I fought.
```

- **shakafa** never changes
- Only **ta** marks that the event is in the past

Concepts can also sit beside other concepts as modifiers:

```example
kaso ka

love person

↓

loving person
```

```example
kaso sha

love collective

↓

loving community
```

```example
kaso fa

love conflict

↓

conflict about love
```

The same concept, three different readings. No spelling change required.

### Composition instead of memorization

New meaning is built by stacking known concepts.

When you know **sha** (collective) and **ka** (person), **shaka** (tribe) should feel inevitable.

```example
sha ka

collective person

↓

tribe
```

You did not memorize a new word. You read a relationship.

### No irregular grammar

Words never inflect. Relationships never hide inside spelling changes.

```example
mi ta kaso
mi kaso
mi na kaso

↓

I loved.
I love.
I will love.
```

**kaso** stays **kaso** in every sentence. Only **ta** or **na** mark non-present time.

### Minimal syntax

The surface grammar stays small on purpose. One predictable sentence skeleton carries most of the work.

```text
Subject · Time · Event · Object · Modifiers
```

The **Time** slot is **empty for present**. Present is the default and is inferred from context. Only past (**ta**) or future (**na**) need a particle.

### Transparent meaning

Reading a compound should reveal its ancestry.

```example
shaka fa

tribe conflict

↓

war
```

**shakafa** is not an opaque token. It is **shaka** (tribe) in relation to **fa** (conflict). The spelling is a compressed semantic tree.

## Rule 1: Concepts Are Universal

Every word is simply a **concept**.

| Concept | Meaning |
| --- | --- |
| **ka** | person |
| **fa** | conflict |
| **sha** | collective |
| **kaso** | love |
| **shaka** | tribe |
| **shakafa** | war |

These are not permanently nouns or verbs. Their role depends on **sentence position** and **surrounding particles**.

```example
ka fa

person conflict

↓

a person's conflict
```

```example
fa ka

conflict person

↓

conflict involving a person
```

Same concepts. Different order. Different relationship.

## Rule 2: Words Never Change

Fonoran has no conjugation, declension, grammatical gender, plural endings, or case endings.

A word is always written the same way.

**shakafa** always remains **shakafa**.

```example
mi ta shakafa
mi shakafa
sha shakafa

↓

I fought.
There is war.
The tribe is at war.
```

Present sentences omit the time particle. **shakafa** never changes.

Time, plurality, and relationships are expressed through **particles** and **word order**, not through mutating the concept itself.

## Rule 3: Grammar Uses Particles

Instead of modifying words, Fonoran uses small **invariant particles** to mark grammatical relationships.

The particle inventory is not finalized. Placeholders below show the intended architecture.

### Tense

Present is **not** a particle. It is the default when no time marker appears.

| Tense | Particle | Status |
| --- | --- | --- |
| Past | ta | Under Development |
| Future | na | Under Development |

### Other particles (planned)

| Role | Particle | Status |
| --- | --- | --- |
| Question | TBD | Under Development |
| Negation | TBD | Under Development |
| Possession | TBD | Under Development |
| Location | TBD | Under Development |
| Direction | TBD | Under Development |
| Comparison | TBD | Under Development |

Even before the full inventory exists, you can already read sentences by treating each slot as a labeled relationship:

```example
mi kaso ka

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
shaka shakafa

↓

The tribe is at war.
```

```example
mi kaso shaka

↓

I love the tribe.
```

```example
mi na kaso shaka

↓

I will love the tribe.
```

Modifiers attach to the nearest eligible slot unless a future particle specifies otherwise (*Under Development*).

## Rule 5: Semantic Compounding

Almost every complex concept should be expressed through **composition**.

**Step 1: combine primitives**

| | |
| --- | --- |
| **sha** | collective |
| **ka** | person |

↓

| | |
| --- | --- |
| **shaka** | tribe |

**Step 2: extend the tree**

| | |
| --- | --- |
| **shaka** | tribe |
| **fa** | conflict |

↓

| | |
| --- | --- |
| **shakafa** | war |

Every derived word **preserves its ancestry**. Words form a semantic tree rather than existing independently.

```mermaid
graph TD
  sha["sha\ncollective"]
  ka["ka\nperson"]
  shaka["shaka\ntribe"]
  fa["fa\nconflict"]
  shakafa["shakafa\nwar"]
  sha --> shaka
  ka --> shaka
  shaka --> shakafa
  fa --> shakafa
```

Compounding rules for the translator: prefer the **shortest transparent path** through approved concepts; omit concepts implied by human experience unless emphasis or disambiguation is needed (**semantic economy**); reject opaque shortcuts that break the tree (*implementation Under Development*).

### Compound Boundary Constraint

> **A valid compound may not join two morphemes when the final consonant of the left morpheme is identical to the initial consonant of the right morpheme. Fonoran does not collapse, lengthen, or silently alter boundary sounds. If such a boundary would occur, the compound candidate is invalid and must be regenerated or assigned different roots.**

This rule preserves Fonoran's core promise: **what you hear = what you write = what you look up**. If a spoken compound sounded like "bemam" a listener would naturally write "bemam", but the dictionary would store "bemmam". That gap violates spelling stability.

| Left | Right | Boundary | Valid? | Reason |
| --- | --- | --- | --- | --- |
| bem | mam | m + m | **No** | identical consonants |
| kal | lum | l + l | **No** | identical consonants |
| bem | lam | m + l | Yes | different consonants |
| ben | mam | n + m | Yes | different consonants |
| ka | so | a + s | Yes | vowel–consonant boundary |
| so | a | o + a | Yes | vowel–vowel boundary |

**This is a generation constraint, not a pronunciation rule.** Fonoran never collapses, lengthens, or silently alters boundary sounds. The constraint prevents generating compounds that would require hidden spelling or pronunciation exceptions.

Multi-part compounds must satisfy the constraint at **every boundary**, not just the first one.

The constraint is enforced at:
- **Build time** (`npm run fonoran:build`) — curated compounds that violate it are dropped with a clear reason.
- **Word generator** (`fonoran-word-generator.js`) — boundary-invalid candidates are excluded from ranked options.
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

When someone learns **sha** (collective) and **ka** (person), they should naturally understand **shaka** (tribe) without memorization.

```example
sha ka

collective person

↓

tribe
```

```example
shaka fa

tribe conflict

↓

war
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
6. **Grammar particles**: attach past (**ta**), future (**na**), question, possession, etc. (*Under Development*). **Omit time particles for present.**
7. **Fonoran sentence**: emit fixed-order surface string

Full implementation spec: [fonoran-interpretive-translator.md](fonoran-interpretive-translator.md).

**Default tense rule:** if the semantic frame has no time particle, the translator treats the sentence as **present** (or contextually current). Only **ta** (past) and **na** (future) appear on the surface.

Whenever a concept cannot yet be expressed in Fonoran, the translator must show it in **red**. Never silently omit it. Never substitute English without marking it as unresolved.

> Red words indicate concepts that do not yet exist in the Fonoran lexicon.

Unknown concepts are valuable. They reveal where the language needs to grow. As the language grows, fewer words will appear in red.

The translator should function as a **language development tool**, not just a translation tool.

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
kaso
kasosha
```

**family** compiles to **kasosha** (love + collective). No time particle: present by default. Every slot resolves through known concepts or transparent compounding.

```example
kaso sha

love collective

↓

kasosha (family)
```

### Example: full compile

```pipeline
English:
The tribe is at war.

Semantic:
tribe
war

Fonoran:
shaka
shakafa
```

Every known concept compiles into Fonoran. **shaka** (tribe), **shakafa** (war). No time particle: the tribe **is at war now**. Nothing hidden. Nothing borrowed from English without marking it.

This architecture allows multiple English expressions to converge into the **same underlying semantic representation**, then diverge again only at the particle layer when needed.

**Non-goals for v1:**

- word-for-word English order preservation
- inflection mimicry
- opaque lexical lookup when a compound path exists

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

*Related: [Fonoran language lab](fonoran.md) · [Semantic foundation](fonoran-semantic-foundation.md) · [Dictionary](/fonoran/#dictionary)*
