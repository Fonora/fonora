# The Fonoran Constitution

> **This is the founding document.** One page. Everything else is detail.
> Philosophy & rationale → [fonoran-philosophy.md](fonoran-philosophy.md) ·
> Syntax → [fonoran-grammar.md](fonoran-grammar.md) ·
> Workflow → [fonoran-compound-workflow.md](fonoran-compound-workflow.md)

## Hypothesis

Two strangers anywhere on Earth, with zero shared language, can achieve basic communication after ~1 hour learning ~50 shared roots — because meaning is built from transparent, culture-neutral concepts anyone can piece together like a puzzle.

## Four rules (enforced at seed level)

1. **Universal phonetics** — roots use sounds anyone can say easily
2. **Audible distinction** — compounds must be distinguishable when heard
3. **Lego recoverability** — a root-knower can guess the meaning; 2–3 roots preferred, 4 max
4. **No double consonants** — hard reject at build

## Vocabulary layers

| Layer | What it is | Size | Example |
| --- | --- | --- | --- |
| **Ring 1 — Campfire core** | Two strangers, ~1 hour | **50** roots | eat, fear, help, water, collective |
| **Ring 2 — Everyday** | Week-two fluency | **100** cumulative | rule, work, understand, tree |
| **Ring 3 — Broad fluency** | Full primitive cap | **150** cumulative max | justice, travel, equal, flow |
| **Compound words** | Roots stacked transparently | unlimited | law = collective + path |

**Hard cap:** 150 primitive roots total. Anything beyond Ring 3 is **compound-only** — not a new primitive.

Canonical ring lists live in [`data/fonoran-root-rings.json`](../data/fonoran-root-rings.json). Apply with `npm run fonoran:root-rings:apply`.

Compounds are **meaning-attempts**, not single correct answers. One preferred form + alternates.

### Root philosophy

A primitive is a **fundamental human experience** that cannot be naturally said with simpler Fonoran concepts — stated in culture-neutral terms ("route to follow", not "God's light"). If two root-knowers from different cultures would both need this idea in week one, it belongs in Ring 1. Rings 2–3 expand fluency within the 150 cap. Everything else is built by composition.

## Grammar (minimal)

**Sentence core (strict order):** Actor → Action → Target · Place · Time float

| Slot | Role | Example |
| --- | --- | --- |
| Actor | who | mi (I) |
| Action | what happens | tel (eat) |
| Target | whom/what | lo (fish) |
| Place | where (floats) | che (home) |
| Time | when (floats) | kan (now) |

**Time particles:** present = *(none)* · past = **ta** · future = **sa**

- `mi bem` = I love (now)
- `mi ta bem` = I loved
- `mi sa bem` = I will love

Words never inflect. Grammar uses a tiny closed particle set (`mi`, `ta`, `sa`, `no`, `ya`, `von`). Full rules → [fonoran-grammar.md](fonoran-grammar.md).

## Seeds are truth

Edit words in Word Manager → writes `data/fonoran-compounds.json` → build → commit → deploy. See [fonoran-compound-workflow.md](fonoran-compound-workflow.md).
