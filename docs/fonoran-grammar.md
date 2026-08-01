# Grammar

> **Detailed syntax reference for layer 3.** Read [the Fonoran rulebook](fonoran-rulebook.md) first.

> **Status**: Living specification. Authoritative syntax reference for humans and the Fonoran Translator. Sections marked *Under Development* are intentional placeholders.

Fonoran is a language of **concepts**. Every lexical item represents a semantic concept. Grammar describes **relationships between concepts** only.

## Design Rule 0: Grammar is the last resort

> **If a distinction can be expressed through ordinary concepts, it should not become grammar. Grammar exists only to express relationships that cannot be naturally represented as concepts.**

This is the filter every other rule answers to. Before adding any particle, marker, or grammatical mechanism, ask whether the same meaning can be expressed compositionally using existing concepts. If the answer is yes, grammar stays out of it. This single principle explains why Fonoran has:

- no dedicated *who / what / where / when / why / how* particles (questions are compositional — see [Rule 3](#rule-3-grammar-uses-particles));
- no *only / also / even* focus particles (these are refinements, expressed lexically if and when usage demands them);
- an intentionally tiny particle inventory (`mi`, `ta`, `sa`, `no`, `ya`, `von`, `ka`);
- a strong preference for transparent compounds over new grammatical machinery.

A distinction earns a particle only once real usage shows it *cannot* be carried by concepts and word order alone.

Roots are organized by **human experience** (survival/body, space/motion, social, emotion,
time, thinking, abstract) and gated by the **campfire test**: *could two strangers stranded
with no common language plausibly need this root in their first week?* If yes, it belongs in
the communicative core; if no, it belongs in the extended or complete vocabulary. See the
[rulebook](fonoran-rulebook.md) for the tiered language model (~50 core → ~100
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
ye + nan

water + path

↓

yenan (river)
```

```example
ye + tem

water + bound

↓

yetem (beach)
```

```example
san + ba

love + person

↓

sanba (family)
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

For the vocabulary rings and the four word rules, read **[the Fonoran rulebook](fonoran-rulebook.md)**. The **Rules** below are the authoritative syntax reference.

| Idea | Rule |
| --- | --- |
| Grammar is the last resort | [Design Rule 0](#design-rule-0-grammar-is-the-last-resort) |
| Concepts, not parts of speech | [Rule 1](#rule-1-concepts-are-universal) |
| Words never inflect | [Rule 2](#rule-2-words-never-change) |
| Grammar uses particles | [Rule 3](#rule-3-grammar-uses-particles) |
| Preferred order | [Rule 4](#rule-4-preferred-order) |
| Meaning through composition | [Rule 5](#rule-5-semantic-compounding) |
| English → Fonoran compiler | [Rule 7](#rule-7-translator-architecture) |

**Present has no time particle.** Past uses **ta**, future **sa**. The event concept stays identical across tenses: `mi san` / `mi ta san` / `mi sa san` → I love / loved / will love.

Modifier chains use the same invariant spellings — **san ba** (loving person), **san dan** (loving community) — with the modifier placed **before its head** ([Rule 4](#rule-4-preferred-order)). Compounds like **yenan** (water + path) and **sanba** (love + person) preserve their ancestry in the spelling; see [Rule 5](#rule-5-semantic-compounding).

## Rule 1: Concepts Are Universal

Every word is simply a **concept**.

| Concept | Meaning |
| --- | --- |
| **ba** | person |
| **pa** | conflict |
| **dan** | collective |
| **san** | love |
| **ye** | water |
| **nan** | path |
| **yenan** | river (water + path) |
| **danbakam** | tribe |
| **danpaba** | war |

These are not permanently nouns or verbs. Their role depends on **sentence position** and **surrounding particles**.

```example
ba pa

person conflict

↓

a person's conflict
```

```example
pa ba

conflict person

↓

conflict involving a person
```

Same concepts. Different order. Different relationship.

## Rule 2: Words Never Change

Fonoran has no conjugation, declension, grammatical gender, plural endings, or case endings.

A word is always written the same way.

**danpaba** always remains **danpaba**.

```example
mi ta danpaba
mi danpaba
danbakam danpaba

↓

I fought.
There is war.
The tribe is at war.
```

Present sentences omit the time particle. **danpaba** never changes.

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

**Numeral overlap.** The syllables **ta** (digit 2) and **sa** (digit 10) also serve as cardinal numerals in counting compounds (`sa-pa` = 11, `sasa-pa` = 21). In numeral context they parse as digits, not tense markers. See [fonoran-numerals.md](fonoran-numerals.md).

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
| Question | ka | Active |

That is the entire grammatical inventory. Everything else — focus, possession, comparison — is expressed with **concepts and word order**, not particles, until usage proves a distinction genuinely needs one. Asking is the one distinction that could not be: it is not a concept in the sentence, it is what the speaker is doing with the whole sentence, and no ordinary word carries it.

**Questions open with `ka`.** Every question, polar or content, begins with the particle, and no `?` is written: the nine-symbol script has no such glyph, and without a word for it `be len mi` is both *you hear me* and *do you hear me*. The ordinary `.` still closes the sentence, because a terminator says only that the sentence ended and `ka` is what says it was a question. `ka` is clause-initial for the same reason `no` precedes what it denies, since a particle sits immediately before what it scopes over and a question scopes the whole clause. There is still no interrogative pro-form. Content (*wh*) questions are formed **compositionally from ordinary concepts** (an "unknown *X*" placed in the relevant role) behind `ka`, which is also what separates the question `ka nohu ba` from the statement `nohu ba` ("an unknown person"). How a given question is composed is a matter of the lexicon and the translator, not grammar — so the grammar never fixes a particular form. The current lexical form is **`nohu`** "unknown" — a *lexicalized word* built from the negation form + `hu` (know), written and taught as one unit (`ka nohu ba` = who, `ka nohu to` = what, `ka nohu che` = where, `ka nohu kan` = when, `ka nohu gak` = why). Playtesting showed the separated `no hu …` read as clause negation ("not know…") rather than as a question word; lexicalizing it is a deliberate vocabulary decision, not productive particle fusion — the `no` particle itself still never fuses in grammar.

The *X* in `nohu X` must be a **dimension**: a root naming a kind of thing while staying neutral about which one. `che` does not say which place, `kan` does not say when, `gak` does not say which cause, `tan` (`count`) does not say how many. A root naming a *value* cannot fill the slot, because it answers the question before it is asked: there is no `nohu lek` ("unknown a-lot"). English *how many* / *how much* are one interrogative, unknown + count (`ka nohu tan`); the noun names what is counted, and Fonoran does not mark the English count/mass split. Manner *how* is unknown + manner (`ka nohu moyu`, the compound do + form). Degree on a quality (*how far*, *how big*) is not yet a dimension question and is asked as a polar probe on the scale word. (Removed in v1 and still removed: the interrogatives `vus/zas/zes/zis/zos/zus` and the focus particles `vat/vet/vit`. The v1 question marker `wo` is not the current one, because `wo` became the lexical root for *lonely*; the marker is `ka`.)

Particles are **reserved**: the root generator never assigns particle forms to a lexical concept. The reserved set is enumerated in [../data/fonoran-primitive-roots-config.json](../data/fonoran-primitive-roots-config.json) (`reserved_particles.forms`) — it includes the active v1 forms plus the forms freed by v1 removals, which stay blocked from lexical reuse for spelling stability pending a future decision.

**Grammar vs. lexicon.** Spatial and relational meaning is *lexical*, not grammatical: "in/inside", "here/there", and the three sense of "toward" (`up`/`dal`, `down`/`nat`, `reach`/`ni`), plus `near`/`far`, are **concepts/roots**, never particles. Likewise, personal pronouns other than `mi` (you/we/they/he/she/it) resolve lexically, and conjunctions (`and`/`or`/`but`/`because`) are handled structurally as clause connectives rather than as emitted particles. This keeps the particle class small and prevents it from shadowing the lexicon.

Polarity is grammar, not vocabulary — **false** is `no` + **true**, **different** is `no` + **same**. Such antonyms are *not* roots and *not* compounds; they are produced at the particle layer.

### Particle placement and quantifiers

Particles occupy fixed positions within the sentence skeleton; they never fuse into adjacent spellings.

- **Negation** immediately precedes the constituent it negates. Usually that is the Action, which negates the clause (*I am not dangerous* -> `mi no gamdal`), but it can equally be a Target noun (*I have no weapon* -> `mi gat no dakpa`) or a quality (*not safe* -> `no kep`). Scope is the constituent it precedes, so in a multi-clause sentence a `no` in one clause does not negate the others: *I will try and I will not stop* is `mi sa wuk mi sa no gitam`, where the negation reaches only the second clause.
- **Quantifier pronouns compose** rather than taking their own root: *nobody* = `no` + **person**, *nothing* = `no` + **thing**, *everyone* = **all** + **person**, *everything* = **all** + **thing**, *someone* = **some** + **person**.
- **Questions** open with `ka` and are written with no terminator: content questions compose from concepts behind it (see above).

Even before the full inventory exists, you can already read sentences by treating each slot as a labeled relationship:

```example
mi san ba

↓

I love someone.
```

Particles are separate from concepts. They never fuse into word spellings.

## Rule 4: Preferred Order

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

Fonoran has no case markers, so a **preferred order** keeps who-did-what-to-whom clear. The language is campfire-simple: stack actions, name the place, say who is acting. Core roles do **not** freely scramble.

### Preferred order

**Actor → Action → Target → Place → Time** is the teaching template and the translator’s default render. Actor and Target stay in that order because either role can be a person (`mi san be` vs `be san mi`).

### Serial Action

Stacked predicates stay in the **Action** chain — no infinitive particle:

```text
ka be sak gi yetem    (do you want to go to the beach?)
mi no sak gi lu de    (I do not want to go alone)
```

`want` + `move` → `sak gi`. Do **not** park the second verb in Target.

### Modality

Modality is **lexical, not grammatical**. Modal senses are ordinary concepts chained in the Action slot on the Serial Action pattern above, so none of them costs a particle, a new root, or a change to the sentence skeleton:

| Sense | Form | Example |
| --- | --- | --- |
| Ability | `hu` (know) + Action | `mi hu kel dat` — I can make fire |
| Necessity | `les` (need) + Action | `gem dan les ginek` — we must run now |
| Possibility, suggestion | `ketnat` (maybe) | `dan ketnat tinal nam` — we can rest here |
| Inability | `no` + Action | `mi no giti` — I cannot walk |

The marker sits immediately **before** the Action it modifies, the same position as `sak` (want) and `no`.

`hu` for ability is the ordinary "know how to" route, and it stays decomposable: `hu kel dat` reads literally as *know make fire*. `ketnat` is the existing `some` + `true` compound, not a new form.

Three cases take **no** modal marker, and adding one is an error:

- **Requests.** An interrogative *can* is a request, and `ka` already carries it: *can you hear me?* is `ka be len mi`, never `ka be hu len mi`.
- **Inability.** Plain negation is sufficient: *I cannot walk* is `mi no giti`.
- **Proposals.** *We can go together* invites; it does not claim skill. `dan gi ho`, optionally with `ketnat`. Rendering it `dan hu gi ho` would say *we know how to walk*.

**Not yet expressible.** *should* / *ought* and permission-granting *you can keep this* are honest gaps. `les` deliberately does **not** cover *should*, because the two diverge under negation: *should not go* forbids, while *les no gi* ("need not go") permits.

### Coordination and disjunction

**`and` needs no marker.** Juxtaposition already reads as conjunction:

```text
mi nes mak saklo      (I am cold and hungry)
dan les lo ye         (we need food and water)
```

**`or` does need one**, because it would otherwise be identical to `and` and therefore assert the opposite of a choice: bare `guba gamba` for *friend or enemy* says the person is both. The group is closed with **`lu`** (`one`, "a single one"), quantifying over the alternatives:

```text
ba guba gamba lu      (that person is a friend or an enemy)
ka be nes yos du lu   (are you tired or sick?)
ka tes nam tak lu        (is the pain here or there?)
ka be sak times gi lu    (do you want to stay or go?)
```

This is lexical, not grammatical, per Design Rule 0: `lu` is an existing quantity root, so disjunction costs no new particle and no new root. `mel` (`all`, "every one of them") is available for emphatic conjunction, and `ket` (`some`, "part of them") for partial selection.

**Position carries the distinction.** `lu` *before* a concept quantifies that concept, which is the existing *alone* idiom `lu de` (one + self):

```text
mi no sak gi lu de    (I do not want to go alone)
ka be sak times gi lu    (do you want to stay or go?)
```

In the first, `lu` precedes a single concept. In the second, it *follows* a group of two or more. Marking only ever attaches after the group it closes, so the two never compete for the same slot.

**Alternatives must be grouped to be marked.** When they are lost before the marking step there is nothing to close, and the gap stays visible rather than `lu` attaching to a lone item. *Is the baby a girl or boy?* reports `girl` and `boy` as gaps because neither has a root, and *Do you mean this or that?* keeps `or` as a gap because demonstratives are skipped as function words.

### Bare destination

A plain “go to X” puts the landmark in **Place** after the motion concept. Do **not** insert `nan` (path/toward) for English *to* alone:

```text
mi gi ye              (I go to the water)
ka be sak gi yetem    (do you want to go to the beach?)
```

Use direction concepts (`nan`, `lo`, `fet`, …) only when the source contrasts direction — *toward*, *from*, *away*:

```text
mi sak gi nan ye      (I want to go toward the water)
gi fet ki lekche      (go away from the city)
```

### The Actor is spoken

There is **no casual Actor drop**. A yes/no question to the addressee keeps `be`:

```text
ka be sak gi yetem    (do you want to go to the beach?)
```

Fonoran marks nothing on the verb, so a subjectless clause carries no trace of who is acting. `sak gi yetem` is equally readable as *I want to go to the beach*, and the reader has no way to choose. The saving is one short word; the cost is that every clause becomes context-dependent, and recovering the Actor from context is exactly the machinery a language without agreement does not have.

An **empty Actor** still occurs where there is genuinely no actor to name: weather (`[rain]`) and imperatives (`gi …`). Those are not drops; nothing was there.

Time and Place may front as scene-setting (they cannot be mistaken for core roles):

```text
mi tel lo gem         (I eat food now)
gem mi tel lo         (now, I eat food)
mi tel lo mesche      (I eat food at-home)
mi gi ye              (I go to the water — bare destination)
```

> Note: `ta`/`sa` (tense) and `no` (negation) stay next to the action; they are not the floating **Time** periphery (time *concepts*: before / now / after, calendar words).

```example
danbakam danpaba

↓

The tribe is at war.
```

```example
mi san danbakam

↓

I love the tribe.
```

```example
mi sa san danbakam

↓

I will love the tribe.
```

```example
ka be sak gi yetem

↓

Do you want to go to the beach?
```

**Modifier attachment is deterministic:** within a phrase, each concept modifies the concept to its **right**; the rightmost concept is the head (`san ba` = loving person; `datwi samkal` = red bird). This makes grouping mechanical rather than interpretive.

> **Long-term design goal:** a meaning that needs modifiers and fills a single role should eventually resolve to *one lexical unit per role* — a root or an approved compound. In v1 we do **not** force adjacent concepts to fuse into a single written word: compounds become canonical because they are useful, reusable concepts (Rule 5), not merely because two words appeared next to each other. Preferred ordering now; earned compounds over time.

## Rule 5: Semantic Compounding

Almost every complex concept should be expressed through **composition**.

**Step 1: combine primitives**

| | |
| --- | --- |
| **ye** | water |
| **nan** | path |

↓

| | |
| --- | --- |
| **yenan** | river |

**Step 2: extend the tree**

| | |
| --- | --- |
| **ye** | water |
| **tem** | bound |

↓

| | |
| --- | --- |
| **yetem** | beach |

Every derived word **preserves its ancestry**. Words form a semantic tree rather than existing independently. Larger social compounds follow the same idea — **danbakam** (tribe), **danpaba** (war) — built from approved roots without inventing opaque spellings.

```mermaid
graph TD
  ye["ye\nwater"]
  nan["nan\npath"]
  yenan["yenan\nriver"]
  tem["tem\nbound"]
  yetem["yetem\nbeach"]
  ye --> yenan
  nan --> yenan
  ye --> yetem
  tem --> yetem
```

Compounding rules for the translator: prefer the **shortest transparent path** through approved concepts; omit concepts implied by human experience unless emphasis or disambiguation is needed (**semantic economy**); reject opaque shortcuts that break the tree (*implementation Under Development*).

### Word families from dimension roots

A **dimension root** names a kind of thing while staying neutral about which one (the same idea Rule 11 uses for questions), and one dimension root buys a whole family of compounds instead of one word each. These families are conventions, not suggestions: a new member of a family composes the same way its siblings do.

| Family | Pattern | Members |
| --- | --- | --- |
| gender | being + **chos**/**shin** (female/male) | mother `feschos`, father `fesshin`, woman, man, girl, boy |
| color | **shot** (color) + exemplar | white = color + light, black = color + dark |
| sound | **shim** (sound) + quality | loud = sound + big, noise = sound + bad |

`shim` (sound) deliberately mirrors `kek` (light): one names what reaches the ear, the other what lets you see — the phenomenon, never the act (`len` hear and `wi` see stay action roots). When a family's dimension root is missing, the fix is the dimension root, not another sibling: the July 2026 register review added nine such roots (happen, new, side, sound, color, wet, heavy, female, male) after finding the missing layer was operators and basic dimensions, not more nouns.

### Compound Boundary Constraint

> **A valid compound may not join two morphemes when the final consonant of the left morpheme is identical to the initial consonant of the right morpheme. Fonoran does not collapse, lengthen, or silently alter boundary sounds. If such a boundary would occur, the compound candidate is invalid and must be regenerated or assigned different roots.**

This rule preserves Fonoran's core promise: **what you hear = what you write = what you look up**. If a spoken compound sounded like "sannan" a listener would naturally write "sannan", but the dictionary would store "sannnan". That gap violates spelling stability.

| Left | Right | Boundary | Valid? | Reason |
| --- | --- | --- | --- | --- |
| san | nan | n + n | **No** | identical consonants |
| kal | lem | l + l | **No** | identical consonants |
| ye | nan | e + n | Yes | vowel–consonant (no double consonant) |
| san | ba | n + b | Yes | different consonants |
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

When someone learns **ye** (water) and **nan** (path), they should naturally understand **yenan** (river) without memorization.

```example
ye nan

water path

↓

yenan (river)
```

```example
ye tem

water bound

↓

yetem (beach)
```

As vocabulary grows, **understanding accelerates**. Each new root unlocks many compounds, and each compound reinforces the roots below it.

Teaching order should follow the semantic tree (roots, then compounds, then sentences), not frequency lists copied from English.

## Rule 7: Translator Architecture

The Fonoran Translator must **not** perform literal word substitution.

English surface forms diverge. Meaning converges. The translator **compiles meaning into Fonoran**.

```mermaid
flowchart TD
  SRC["Source sentence"]
  subgraph Source["Source language (third-party tagger)"]
    ME["Word class and lemma"]
    SG["Concept frame: slots + concept ids"]
  end
  subgraph Deterministic["Deterministic render (hard rules)"]
    PC["Concept ids to approved roots"]
    CC["Compound construction / marked loans"]
    GP["Grammar particles + fixed order"]
    FO["Fonoran sentence"]
  end
  SRC --> ME --> SG --> PC --> CC --> GP --> FO
```

Only the left half knows the source language, and it is a maintained third-party dependency rather than our own rules. Everything from concept ids onward is deterministic and never invents a spelling.

**Current implementation (July 2026).** One engine, `translateEnglishLegacy` in `tools/fonoran-translator.js`, serves the translator, Learn, and the alignment view alike. See **[fonoran-algorithm-translation.md](fonoran-algorithm-translation.md)** for the full walk from sentence to surface, and **[fonoran-translator.md](fonoran-translator.md)** for API fields and the module map.

At a high level:

1. **Source sentence** → [`wink-nlp`](https://winkjs.org/wink-nlp/) supplies word class and dictionary form.
2. **Roles** — Actor, Action, Target, Place, Time are read off word class, never off position.
3. **Resolve** — each word becomes a concept id through a fixed tier order, or is reported as an honest gap.
4. **Render** — `slotsToTokens()` and `buildSurface()` map concept ids to approved spellings. No invented roots.
5. **Playback** — `attachTranslatorPlayback()` builds Fonora script + TTS segments (same pipeline as Samples).

The hand-written pattern cascade that preceded the tagger was deleted in July 2026.

**The semantic frame is a real pivot object.** Between the parse and the surface,
`translateEnglish` builds an explicit, language-neutral frame:

```json
{
  "actor":  [{ "concept_id": "person", "english": "man", "fonoran": "ba",
               "resolution_kind": "direct", "confidence": "high" }],
  "action": [{ "concept_id": "move",   "english": "jumped", "fonoran": "gi",
               "resolution_kind": "interpreted", "confidence": "medium" }],
  "target": [], "place": [], "time": [], "modifiers": [],
  "particles": [{ "role": "time", "english": "past", "form": "ta" }],
  "gaps": []
}
```

Every filled role references a **`concept_id` + provenance** (never a raw English
token). Every unresolved element is a first-class **gap** `{ role, english,
reason }` that renders as `[english]` in the surface and flows to the gap report.
The Fonoran surface is generated purely from the resolved tokens, so the frame is
a faithful description of what the surface actually says — it never fabricates.

**Motion & want+go** (Rule 4):

```example
Do you want to go to the beach?

↓ slots

addressee · want · move · beach

↓ surface

ka be sak gi yetem
```

```example
go away from the city

↓ slots

move · far · source · city

↓ surface

gi fet ki lekche
```

```example
I want to go toward the water

↓ slots

mi · want · move · path · water

↓ surface

mi sak gi nan ye
```

Plain destinations are bare Place landmarks. `nan` / `lo` / `fet` appear only for real direction contrast. Serial predicates stay in Action (`want`+`move` → `sak gi`), never Target.

**Pipeline stages:**

1. **English**: arbitrary phrasing, idioms, reorderings
2. **Meaning extraction**: normalize to language-neutral propositions
3. **Semantic graph**: entities, events, relations, time, negation
4. **Primitive concepts**: map graph nodes to approved Fonoran roots
5. **Compound construction**: build or select transparent compounds for complex nodes
6. **Grammar particles**: attach past (**ta**), future (**sa**), negation (**no**), conditional (**von**). **Omit time particles for present.** A question opens with **ka** and takes no terminator; content questions compose the unknown from concepts behind it.
7. **Fonoran sentence**: emit preferred-order surface string

Full implementation spec: [fonoran-translator.md](fonoran-translator.md) (live path) · [fonoran-interpretive-translator.md](fonoran-interpretive-translator.md) (legacy English compiler).

**Default tense rule:** if the semantic frame has no time particle, the translator treats the sentence as **present** (or contextually current). Only **ta** (past) and **sa** (future) appear on the surface.

Whenever a concept cannot yet be expressed in Fonoran, the translator must show it in **red**. Never silently omit it. Never substitute English without marking it as unresolved.

> Red words indicate concepts that do not yet exist in the Fonoran lexicon.

Unknown concepts are valuable. They reveal where the language needs to grow. As the language grows, fewer words will appear in red.

The translator should function as a **language development tool**, not just a translation tool.

### Resolution cascade & honest gaps

Each English token is resolved through an **ordered, scored cascade with a hard
confidence floor**. The first legitimate match at or above the floor wins; below
the floor the token is an **honest gap** (red) — the translator never fabricates
a spelling and **never consults WordNet at runtime**.

| Tier | Confidence | `resolution_kind` | Quality | Notes |
| --- | --- | --- | --- | --- |
| Curated strong alias / concept id / lemma / phrase | high | `direct` | pass | Concept id, localized alias, or lab meaning/curated alias. |
| Curated interpretation | medium | `interpreted` | pass | Tense lemmas, idioms, spatial/relational rules, concept hints/bridges, head-noun of a phrase, transparent compound assembly (over strong aliases only). |
| Runtime compound from a bridge | medium | `composed` | pass | Transparent multi-root path assembled from approved roots (e.g. `sentience → think+self`); fuses to one word when the Compound Boundary Constraint passes, else a space-separated phrase. |
| Marked phonetic loan | low | `loan` | pass (marked) | Proper noun / unmappable term phonetically borrowed and visibly wrapped `«…»` (the "iPhone stays iPhone" rule). Never composed from roots. |
| **Below floor** | low | `unknown` | gap | No confident concept — surfaces in red for the designer to grow a root. A demoted weak (gloss) alias is carried as a non-authoritative `suggestion` for the curation queue but is **never emitted**. |

**Strong vs weak aliases.** An alias is **strong** when it comes from a curated
source: the concept id, its localized aliases, or a lab sound's meaning/curated
aliases. An alias is **weak** when it is merely a token from a concept's
*description gloss* (e.g. `dark`'s gloss "no light" leaks the token `light`).
Weak aliases can **never shadow** a strong root, and — unlike earlier versions —
they **no longer surface as output**: a weak-only match is an honest gap that
carries the weak alias as a review `suggestion`. This kills silent mismatches
like the old `travel → path`, `light → dark`, and `high → fast` errors.

**No runtime guessing (Design Rule 0).** The translator does not invent
multi-root compounds, and it does not run WordNet synonym/hypernym lookups or a
"nearest concept" guess. This eliminates the fabrication class that produced
`behind → ja` (WordNet flattened `behind`'s noun sense *buttocks* → `can` →
`metal` → `ja`). Unknown words are honest gaps so the language can be grown
deliberately.

**WordNet is an offline curation assistant.** `tools/fonoran-semantic-lookup.js`
still uses WordNet, but only offline: it proposes ranked alias/concept
candidates — disambiguated by the slot's part of speech (WSD) and ranked by
sense frequency — for a **human** to approve into
[../data/localizations/en.json](../data/localizations/en.json). Suggestions
appear in the gap report (`suggestGapConcepts`) and the concept editor; they are
never authoritative runtime output.

**Curated relational vocabulary.** Spatial/relational words are added
deliberately, not guessed. `beside → near` is a curated interpretation rule.
`behind` (`so`) and `front` (`cha`) have since been grown through the normal
root pipeline; `between` still has no Fonoran root and remains a **tracked
honest gap** until one is grown the same way.

**Locative predicates keep the relation.** In a static locative predicate
(`the cat is behind the tree`) the parser routes the leading spatial preposition
into the **Place** slot instead of collapsing the predicate to its head noun. A
relation that has a concept resolves there (`above → up`, `under → down`,
`beside → near`, so `the bird is above the tree → kal ra tet`); a concept-less
relation surfaces as an honest Place gap (`the cat is behind the tree →
kal [behind] tet`, gap `{role: 'path', english: 'behind'}`). The old parser
silently dropped the preposition and produced just "cat tree" — the exact
failure this construction fixes. Concept-less relational preps are enumerated in
`LOCATIVE_GAP_PREPS` (`behind`, `between`, `among`, `beyond`, `around`);
contentless containment preps (`in`/`at`/`on`) stay skipped.

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
npm run test:translator            # assert: FAIL on any golden drift OR new gap
npm run test:translator:update     # accept current output as the new golden + gap baseline
node scripts/fonoran-translation-gaps.js                    # full human report (coverage, gaps + suggestions, collapses)
node scripts/fonoran-translation-gaps.js --update-gap-baseline  # accept current honest gaps as the new baseline
```

**Gap baseline — the growth backbone.**
[../data/fonoran-translation-gap-baseline-deterministic.json](../data/fonoran-translation-gap-baseline-deterministic.json)
tracks the set of English words the language does not yet express (honest gaps).
`--assert` fails on any **new** gap beyond the baseline, so curation is
measurable and regressions are caught while the baseline can only shrink as roots
are grown. `--update-golden` refreshes it automatically; the human report annotates
each gap with WordNet curation **suggestions**.

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
san
sanba
```

**family** compiles to **sanba** (love + person). No time particle: present by default. Every slot resolves through known concepts or transparent compounding.

```example
san ba

love person

↓

sanba (family)
```

### Example: full compile

```pipeline
English:
The tribe is at war.

Semantic:
tribe
war

Fonoran:
danbakam
danpaba
```

Every known concept compiles into Fonoran. **danbakam** (tribe), **danpaba** (war). No time particle: the tribe **is at war now**. Nothing hidden. Nothing borrowed from English without marking it.

### Example: want + go (simplified grammar)

```pipeline
English:
Do you want to go to the beach?

Semantic:
addressee
want
move
beach

Fonoran:
ka be sak gi yetem
```

Serial Action (`sak gi`), bare Place (`yetem`), no path particle. The Actor is always spoken.

This architecture allows multiple English expressions to converge into the **same underlying semantic representation**, then diverge again only at the particle layer when needed.

**Non-goals for v1:**

- word-for-word English order preservation
- inflection mimicry
- opaque lexical lookup when a compound path exists

## Semantic coordinates (archive / DDA)

> **The DDA coordinate track is not production design.** Roots are organized by human experience and the campfire test; compounds are judged by recoverable meaning, not coordinate correctness. This section documents the **legacy internal mapping** still used by the lab's DDA inference (Advanced tab).

Each word may carry internal **depth**, **mode**, and **aspect** coordinates — a compact address in semantic space. They are assigned automatically (**DDA inference**) from sound shape and English gloss match, blended for compounds, with status `pending | inferred | confirmed | stale`. You do not edit them in normal workflow; re-run DDA from the Advanced tab when coordinates go stale after a meaning or recipe change. The word detail view shows the three values plus how they were inferred.

Experiment history: [fonoran-gen3.md](archive/fonoran-gen3.md).

## Future Work

The following topics extend this specification without breaking Rules 1 through 7.
**Status** reflects the live translator (not the full Rule 7 semantic-graph target).

| Topic | Status |
| --- | --- |
| Pronouns | **Partial** — `mi` particle; `you`/`we`/`he`/`she` resolve to roots |
| Negation | **v1** — `no` immediately precedes the negated constituent, whether an Action (`mi no gamdal`, I am not dangerous), a Target noun (`mi gat no dakpa`, I have no weapon), or a quality (`no kep`, not safe). Measured across 209 negated corpus phrases. Scope is the constituent it precedes, so one clause's `no` does not negate another's. The frame slot that carries `no` varies by parse and is not a placement rule |
| Questions | **v1** — clause-initial **ka**, both polar and content; content questions add *nohu* "unknown" + a **dimension** (person/thing/place/time/cause/manner/count). *how* → `nohu moyu` (manner = do+form). *how many* / *how much* → `nohu tan` (count). Degree (*how far*) is a polar probe for now. Never `nohu lek`: many is a value, not the axis. |
| Comparisons | Open |
| Numbers | **Open** — cardinals 1–99 are specified in [fonoran-numerals.md](fonoran-numerals.md) but **not implemented**: no numeral appears in any seed file and the translator returns number words unresolved |
| Quantifiers | **Partial** — `nobody`, `everyone`, etc. expand to particles + roots |
| Time expressions | **Partial** — `yesterday`/`tomorrow`, `every morning` |
| Locations / motion | **Partial** — Path slot: `path`, `source`, `far`, `inside`, `up`, `near` |
| Conditionals | **Partial** — `if` / `von` in golden torture tests |
| Relative clauses | Open |
| Aspect / progressive | Open — English progressive collapses to `move` (`gi`) for now |
| Subordinate clauses | **Partial** — `and`/`but` coordination; pure temporal scene-setting fronts via Time periphery; `when` with its own actor+action splits frames (still maturing) |
| Coordination: `and` | **v1** — bare juxtaposition. "I am cold and hungry" is `mi nes mak saklo`; no marker is needed because juxtaposition already reads as conjunction |
| Coordination: `or` | **v1** — juxtaposition **plus `lu`** (`one`, "a single one") closing the group. See Disjunction below |
| Modality | **v1** — lexical, chained in the Action slot: ability `hu` (know), necessity `les` (need), possibility `ketnat` (maybe), inability plain `no`. No particle and no new root. Requests (interrogative *can*), inability, and proposals take **no** marker. *should* / *ought* and permission-granting *you can keep this* remain **Open**: `les` is deliberately not extended to *should*, because the two diverge under negation |

Contributions should preserve: invariant words, particle-based grammar, fixed default order, visible semantic compounding, and semantic economy in compounds.

*Related: [Fonoran language lab](fonoran.md) · [Semantic foundation](archive/fonoran-semantic-foundation.md) · [Dictionary](/language#dictionary) · [Learn Fonoran](/language)*
