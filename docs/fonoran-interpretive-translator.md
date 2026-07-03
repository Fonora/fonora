# Interpretive Translator
> **Now a research note.** This document is preserved as a primary source. Related narrative in the research notebook: [RN-15 · Compiling English into meaning](/research/notes/interpretive-translator).


> **Status**: Active. Compiles English into **nearest approved Fonoran concepts** — not word-for-word glosses.

## Philosophy

Fonoran is a language of **concepts**. English is input to a **semantic compiler**:

1. Parse into a **grammar frame** (roles, not parts of speech)
2. Map each slot to the **closest approved concept**
3. Emit **roman + particles** in Fonoran order

```example
all men are created equal

↓ frame

person · make · equal

↓ surface

ba no mal
```

Present has **no time particle**. Past uses **ta**, future **sa**.

## Three layers

```text
English text
    ↓  Frame parser (phrase-aware, multi-sentence)
Semantic frame (subject, time, event, path, object, modifiers)
    ↓  Resolution (curated aliases → rules → semantic; honest gaps)
Concept ids + spellings
    ↓  Surface builder
Roman line + pronunciation + script
```

### Layer 1: Frame parser

Tokenizes English, skips articles/auxiliaries/conjunctions, assigns **grammar slots** per [fonoran-grammar.md](fonoran-grammar.md).

| Slot | Role |
| --- | --- |
| Subject | Who or what the sentence is about |
| Time | Tense particle or time phrase (`every morning`). **Omitted for present** |
| Event | What happens |
| Path | Spatial relation |
| Object | Landmark or patient |
| Modifiers | Adjectives, predicates, extra concepts |

**Before naive word-order fallback**, the parser tries:

| Pattern | Example |
| --- | --- |
| Sentence split | Paragraphs on `.` / `!` / `?` → `discourse` mode |
| Clause split | `and` + `the` / pronoun / verb → coordinated clauses |
| Time adverbial | `every morning`, `yesterday`, `each day` → time slot |
| Idiom | `at war` → `conflict` |
| Be + participle / adjective | `are created equal`, `is quiet` |
| Linking verb + predicate | `air feels cool` → event `feel`, modifier `cool` |
| Phrasal verb | `wake up`, `wakes up` |
| Motion destination | `go to the city` → event `move` + path `path` + object `city` |
| Motion origin / away | `come from the river` → move + source + river; `ran away` → move + far |
| Spatial phrase | `jumped over the moon` → event + path + object |
| Future peel | `going to jump`, `will` → `sa` + main verb phrase (not bare `go` or `going to` + place) |

**Pronouns:** `I` / `me` → particle **mi** (any slot). Other pronouns map to nearest concept hints (`we` → `collective`, etc.). Second-person `you` maps to **addressee** (`be`).

### Motion toward / away / from

English locomotion collapses to **`move`** (`gi`). Direction is lexical in the **Path** slot — not a separate English “go”:

| English | Frame | Example surface |
| --- | --- | --- |
| go / walk to X | move · path · X | `mi gi nan lekche` |
| will go to X | · sa · move · path · X | `mi sa gi nan lekche` |
| come from X | move · source · X | `mi gi lo yetasnan` |
| run away | move · far | `kal ta ginek fet` |
| go away from X | move · far · source · X | `mi gi fet lo lekche` |

`going to` + **verb** (future intent) peels to **sa**; `going to` + **place** stays present motion with path **nan**.

### Layer 2: Resolution

Module: `tools/fonoran-english-resolve.js`.

**Tiers** (best → worst):

| Tier | Meaning | UI |
| --- | --- | --- |
| `direct` | Strong (curated) alias or lab match | default |
| `interpreted` | Rules, class, idiom, frame hint | yellow |
| `semantic` | WordNet synonym / hypernym (existing root only) | orange |
| `alias_weak` | Weak (description/gloss-derived) alias — low confidence | orange |
| `unknown` | No approved spelling | **red** `[english]` |

Resolution order per token:

1. Frame **concept hint** (linking verbs, idioms, path slots)
2. Direct (strong) alias — inventory, `data/localizations/en.json`, lab sounds/compounds
3. Class / irregular past — `data/fonoran-interpretation-rules.json`
4. WordNet single-concept fallback (`semantic`) → else weak alias (`alias_weak`)
5. Unresolved — never silently dropped, never fabricated

**Strong aliases beat weak (description-derived) aliases** for the same key,
regardless of order — so a gloss token like `light` from dark's "no light" can
never shadow the real `light` root. Interpretation never mints new roots, and
there is no generated-compound guess tier (the Word Generator was removed).

### Layer 3: Surface

Walks resolved tokens in slot order. Grammar particles (`mi`, `ta`, `sa`) emit as-is. Unresolved slots stay **red** in the UI.

## UI

Translator tab: `language/index.html` + `language/fonoran-app.js`.

- Color tiers on tokens (interpreted / semantic / alias_weak / unknown)
- Unresolved tokens render in red as honest gaps — add a concept/compound in the Concept Editor or Word Creator
- Example chips use sentences that resolve cleanly (e.g. *All men are created equal*)

## Data files

| File | Purpose |
| --- | --- |
| `data/fonoran-interpretation-rules.json` | Idioms, verb classes, spatial preps, irregular past |
| `data/localizations/en.json` | English aliases per concept (`feel` ≠ `touch`) |
| `data/fonoran-approved-roots.json` | Approved spellings |
| `tools/fonoran-concepts.js` | Runtime inventory + alias index |
| `tools/fonoran-interpretation.js` | Phrase matchers, clause/time helpers |
| `tools/fonoran-english-resolve.js` | Unified resolution pipeline |

## API

`POST /api/fonoran/translate` returns `surface`, `semantic.slots`, `tokens` (with `resolution_kind`), `interpretations`, and `unresolved`.

## Extending

**Verb class** — add to `classes` in `fonoran-interpretation-rules.json`.

**Spatial prep** — add to `spatial_path` in the same file.

**Exact English word** — add alias under the concept in `data/localizations/en.json` (preferred over class rules).

**Idiom** — add multi-word entry to `idioms` in rules JSON.

## Formal / legal English

Long formal prose (declarations, statutes) will surface **many red tokens** until matching roots exist — that is intentional. The compiler should still:

- Split `be + participle` predicates into separate slots (`born` → event, adjectives as modifiers)
- Carry subject across coordinated clauses (`They … and should act …`)
- Omit modals (`should`, `must`, …) until obligation grammar exists
- Block bogus WordNet mappings (`reason` ≠ earth, `spirit` ≠ feel)

Example acceptance target (UDHR Article 1, today’s lexicon):

```text
ba me [free] mal [dignity] [rights] · fi tu pa [conscience] che mam sam [spirit] [brotherhood]
```

## Implementation

| Module | Role |
| --- | --- |
| `tools/fonoran-interpretation.js` | Rules, phrase/clause matchers |
| `tools/fonoran-english-resolve.js` | Alias lookup, tiers, WordNet |
| `tools/fonoran-translator.js` | Frame compiler, discourse merge, surface |
| `language/fonoran-app.js` | Translator UI |

## Future work

- Compound assembly from approved roots only (transparent paths)
- More coordinated-clause patterns (shared subject across `and` chains)
- Prefer approved lab spellings over legacy vocabulary when both exist
