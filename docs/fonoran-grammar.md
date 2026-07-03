# Grammar

> **Read the research.** Why grammar lives in closed-class particles instead of the lexicon is told in the research notebook: [RN-14 · Grammar as particles, not words](/research/notes/grammar-as-particles-not-words).

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

## Design Rule 0: Grammar is the last resort

> **If a distinction can be expressed through ordinary concepts, it should not become grammar. Grammar exists only to express relationships that cannot be naturally represented as concepts.**

This is the filter every other rule answers to. Before adding any particle, marker, or grammatical mechanism, ask whether the same meaning can be expressed compositionally using existing concepts. If the answer is yes, grammar stays out of it. This single principle explains why Fonoran has:

- no dedicated *who / what / where / when / why / how* particles (questions are compositional — see [Rule 3](#rule-3-grammar-uses-particles));
- no *only / also / even* focus particles (these are refinements, expressed lexically if and when usage demands them);
- an intentionally tiny particle inventory (`mi`, `ta`, `sa`, `no`, `ya`, `von`);
- a strong preference for transparent compounds over new grammatical machinery.

A distinction earns a particle only once real usage shows it *cannot* be carried by concepts and word order alone.

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

The full proposed primitive inventory lives in [fonoran-semantic-foundation.md](archive/fonoran-semantic-foundation.md).

Read the examples first. You can already start understanding this language.

## At a glance

Fonoran grammar **minimizes lexical categories**. Every lexical item is an **invariant concept**; its role comes from **grammar particles** and **sentence position**, not from noun, verb, or adjective labels.

For the *why* — the communication experiment, campfire test, meaning-attempts, and tiered vocabulary — read **[the Fonoran Constitution](fonoran-constitution.md)**. The **Rules** below are the authoritative syntax reference.

| Idea | Rule |
| --- | --- |
| Grammar is the last resort | [Design Rule 0](#design-rule-0-grammar-is-the-last-resort) |
| Concepts, not parts of speech | [Rule 1](#rule-1-concepts-are-universal) |
| Words never inflect | [Rule 2](#rule-2-words-never-change) |
| Grammar uses particles | [Rule 3](#rule-3-grammar-uses-particles) |
| Fixed core, floating periphery | [Rule 4](#rule-4-fixed-core-floating-periphery) |
| Meaning through composition | [Rule 5](#rule-5-semantic-compounding) |
| English → Fonoran compiler | [Rule 7](#rule-7-translator-architecture) |

**Present has no time particle.** Past uses **ta**, future **sa**. The event concept stays identical across tenses: `mi bem` / `mi ta bem` / `mi sa bem` → I love / loved / will love.

Modifier chains use the same invariant spellings — **bem ba** (loving person), **bem ben** (loving community), **bem nal** (conflict about love) — with the modifier placed **before its head** ([Rule 4](#rule-4-fixed-core-floating-periphery)). Compounds like **benba** (collective + person) and **benbanal** (tribe + conflict) preserve their ancestry in the spelling; see [Rule 5](#rule-5-semantic-compounding).

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

The v1 inventory is intentionally tiny (Design Rule 0): six forms, listed below. It grows only when usage proves a distinction cannot be carried by concepts and word order.

### Tense

Present is **not** a particle. It is the default when no time marker appears.

| Tense | Particle | Status |
| --- | --- | --- |
| Past | ta | Active |
| Future | sa | Active |

### The v1 particle inventory

The full inventory (forms, roles, English triggers) lives in [../data/fonoran-grammar-particles.json](../data/fonoran-grammar-particles.json). The particle class is **closed and minimal** (Design Rule 0): a word is a particle only if it is genuinely grammatical — it cannot be a lexical concept — *and* it is sanctioned here or wired in the translator. The complete v1 set is:

| Role | Particle | Status |
| --- | --- | --- |
| Pronoun (I) | mi | Active |
| Past | ta | Active |
| Future | sa | Active |
| Negation | no | Active |
| Affirmation | ya | Active |
| Conditional (if) | von | Active |

That is the entire grammatical inventory. Everything else — questions, focus, possession, comparison — is expressed with **concepts and word order**, not particles, until usage proves a distinction genuinely needs one.

**Questions carry no particle.** There is no question marker and no interrogative pro-form. Content (*wh*) questions are formed **compositionally from ordinary concepts** (e.g. an "unknown person / thing / place / time" placed in the relevant role), and written questions are marked with **`?`**; spoken questions rely on **intonation**. How a given question is composed is a matter of the lexicon and the translator, not grammar — so the grammar never fixes a particular form. *Why* and *how* are deliberately **not yet expressible** in v1: Fonoran has no robust *reason* or *method* concept, and the language admits that rather than approximating it. (Removed in v1: the former question marker `wo`, the interrogatives `vus/zas/zes/zis/zos/zus`, and the focus particles `vat/vet/vit`.)

Particles are **reserved**: the root generator never assigns particle forms to a lexical concept. The reserved set is enumerated in [../data/fonoran-primitive-roots-config.json](../data/fonoran-primitive-roots-config.json) (`reserved_particles.forms`) — it includes the active v1 forms plus the forms freed by v1 removals, which stay blocked from lexical reuse for spelling stability pending a future decision.

**Grammar vs. lexicon.** Spatial and relational meaning is *lexical*, not grammatical: "in/inside", "here/there", and the three sense of "toward" (`up`/`dal`, `down`/`nat`, `reach`/`ni`), plus `near`/`far`, are **concepts/roots**, never particles. Likewise, personal pronouns other than `mi` (you/we/they/he/she/it) resolve lexically, and conjunctions (`and`/`or`/`but`/`because`) are handled structurally as clause connectives rather than as emitted particles. This keeps the particle class small and prevents it from shadowing the lexicon.

Polarity is grammar, not vocabulary — **false** is `no` + **true**, **different** is `no` + **same**. Such antonyms are *not* roots and *not* compounds; they are produced at the particle layer.

### Particle placement and quantifiers

Particles occupy fixed positions within the sentence skeleton; they never fuse into adjacent spellings.

- **Negation** attaches near the action, before the Action concept (e.g. *I never said that* -> `mi no` + action). It is clause-scoped.
- **Quantifier pronouns compose** rather than taking their own root: *nobody* = `no` + **person**, *nothing* = `no` + **thing**, *everyone* = **all** + **person**, *everything* = **all** + **thing**, *someone* = **some** + **person**.
- **Questions** add no particle: content questions compose from concepts and are written with `?` (see above).

Even before the full inventory exists, you can already read sentences by treating each slot as a labeled relationship:

```example
mi bem ba

↓

I love someone.
```

Particles are separate from concepts. They never fuse into word spellings.

## Rule 4: Fixed Core, Floating Periphery

Fonoran's sentence structure follows how people naturally think about an event — **who did what to what, where, and when**:

```text
Actor · Action · Target · Place · Time
```

```mermaid
flowchart LR
  Actor["Actor"]
  Action["Action"]
  Target["Target"]
  Place["Place"]
  Time["Time"]
  Actor --> Action --> Target --> Place --> Time
```

Fonoran has no case markers, so **word order is the sole disambiguator for the core roles**. The rule splits into two parts:

- **The core — Actor → Action → Target — is strict.** These roles are semantically interchangeable (a person can love or be loved), so their order is fixed and load-bearing.
- **The periphery — Place and Time — floats.** A place concept or a time concept can only be read as place or time, so it cannot be mistaken for a core role. It may sit in its slot or be fronted as scene-setting. All of these are valid:

```text
mi tel lo kan-now        (I eat fish now)
kan-now mi tel lo        (now, I eat fish)
mi tel lo che-home       (I eat fish at-home)
```

**Why this order:**

- **Intuitive**: it mirrors "who → did what → to what → where → when"
- **Predictable**: the ambiguous core always follows one template
- **Natural**: fronting time/place as scene-setting is what many languages do
- **Easy to parse**: the strict core maps cleanly to who-did-what-to-whom

> Note: `ta`/`sa` (tense) and `no` (negation) are grammatical markers that stay next to the action; they are not the floating **Time** periphery, which is for *time concepts* (before / now / after, calendar words).

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

**Modifier attachment is deterministic:** within a phrase, each concept modifies the concept to its **right**; the rightmost concept is the head (`bem ba` = loving person; `datwi kal` = red bird). This makes grouping mechanical rather than interpretive.

> **Long-term design goal:** a meaning that needs modifiers and fills a single role should eventually resolve to *one lexical unit per role* — a root or an approved compound. In v1 we do **not** force adjacent concepts to fuse into a single written word: compounds become canonical because they are useful, reusable concepts (Rule 5), not merely because two words appeared next to each other. Deterministic ordering now; earned compounds over time.

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

**Current implementation (slot-filling compiler).** The live translator in
`tools/fonoran-translator.js` implements an earlier stage of this pipeline: English
→ **grammar slots** (Actor · Action · Target · Place · Time; Place covers spatial/motion landmarks) →
resolution cascade → surface. It does **not** yet build a full semantic graph.
Motion frames are matched programmatically (`matchMotionPhrase` in
`tools/fonoran-interpretation.js`) from declarative rules in
`data/fonoran-interpretation-rules.json` — not per-phrase hard-coded glosses.

**Multi-path motion** (direction in the Path slot, multiple entries allowed):

```example
go away from the city

↓ slots

move · far · source · city

↓ surface

gi fet lo lekche
```

```example
run toward us from the river

↓ slots

collective · past · run · path · source · river

↓ surface

dan ta ginek nan yetasnan
```

**Pipeline stages:**

1. **English**: arbitrary phrasing, idioms, reorderings
2. **Meaning extraction**: normalize to language-neutral propositions
3. **Semantic graph**: entities, events, relations, time, negation
4. **Primitive concepts**: map graph nodes to approved Fonoran roots
5. **Compound construction**: build or select transparent compounds for complex nodes
6. **Grammar particles**: attach past (**ta**), future (**sa**), negation (**no**), conditional (**von**). **Omit time particles for present.** Questions add no particle — content questions compose from concepts and are written with `?`.
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
Second-person **`you`** resolves lexically to the **`addressee`** root (**`be`**), symmetric to **`self`** (**`de`**) for the speaker.

### Probe corpus (complex English, non-blocking)

[../data/fonoran-translation-probes.json](../data/fonoran-translation-probes.json) holds
**soft probes**: English phrases with a `target_frame` of required slot heads. The
probe runner checks structure, not exact roman — it does **not** fail CI.

```bash
npm run test:translator:probes
```

Promote a probe to the golden corpus once its output is committed.

### Golden regression suite

[../data/fonoran-translation-tests.json](../data/fonoran-translation-tests.json)
is a **golden corpus**: canonical English sentences across leveled tiers, each with
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

Experiment history: [RN-08 · Meaning from coordinates](/research/notes/meaning-from-coordinates-the-gen-3-dda-experiment) · [fonoran-gen3.md](archive/fonoran-gen3.md).

## Future Work

The following topics extend this specification without breaking Rules 1 through 7.
**Status** reflects the live translator (not the full Rule 7 semantic-graph target).

| Topic | Status |
| --- | --- |
| Pronouns | **Partial** — `mi` particle; `you`/`we`/`he`/`she` resolve to roots |
| Negation | **Partial** — `no` particle in Time slot |
| Questions | **v1** — no particle; content questions compose from concepts (*unknown* + person/thing/place/time), written with `?`, spoken via intonation. *why/how* deferred (no *reason*/*method* concept yet) |
| Comparisons | Open |
| Numbers | Open |
| Quantifiers | **Partial** — `nobody`, `everyone`, etc. expand to particles + roots |
| Time expressions | **Partial** — `yesterday`/`tomorrow`, `every morning` |
| Locations / motion | **Partial** — Path slot: `path`, `source`, `far`, `inside`, `up`, `near` |
| Conditionals | **Partial** — `if` / `von` in golden torture tests |
| Relative clauses | Open |
| Aspect / progressive | Open — English progressive collapses to `move` (`gi`) for now |
| Subordinate clauses | **Partial** — `and`/`but` coordination; `when`/`after` still weak |

Contributions should preserve: invariant words, particle-based grammar, fixed default order, visible semantic compounding, and semantic economy in compounds.

*Related: [Fonoran language lab](fonoran.md) · [Semantic foundation](archive/fonoran-semantic-foundation.md) · [Dictionary](/language#dictionary) · [Learn Fonoran](/language)*
