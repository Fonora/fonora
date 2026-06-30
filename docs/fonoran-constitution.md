# The Fonoran Constitution

> **Status**: Authoritative. This document states *what Fonoran is for*. Where the
> grammar describes *how* concepts combine, this describes *why* and *how we judge success*.
> When a design decision is unclear, this document wins.

## What Fonoran is

Fonoran is **an experiment in whether people from different native languages can
communicate basic meaning by combining a small shared set of roots.**

It is *not* primarily a normal conlang, a perfect ontology, or a deterministic
compound generator. Those framings produced a language optimized for technical
correctness instead of for communication.

The core goal:

> A speaker who knows the roots should be able to **invent** an expression, and
> another speaker who knows the roots should have a **reasonable chance of
> understanding it.**

These two speakers do not need to produce identical words. Communication succeeds
if meaning is **recoverable**.

```text
"river"
  speaker A:  water + path
  speaker B:  flow  + water
  speaker C:  long  + water
```

All three are valid. None is "wrong." The dictionary may *prefer* one form, but it
records the others as **understandable alternates**.

## The one question

Every word, every compound, every root decision is judged by a single question:

> **"If someone only knew the roots, would this expression probably help them
> recover the intended meaning?"**

Not: *"Is this the most technically correct semantic decomposition?"*

We optimize for **successful communication**, not perfect decomposition.

## What Fonoran optimizes for

1. **Minimal memorization** — a small shared set of roots.
2. **Intuitive root combinations** — combinations a stranger would guess.
3. **Recoverable meaning** — the listener can reconstruct intent.
4. **Basic cross-cultural communication** — survival, emotion, social, body, space.
5. **Easy reading, speaking, and writing.**
6. **Conversational repair** — when the first expression fails, speakers try again,
   clarify, and converge. Failure is part of the protocol, not a defect.

## Compounds are meaning-attempts, not canonical answers

- A compound is a **communicative strategy**, not the one correct answer.
- The dictionary keeps a **preferred form** *and* a list of **alternate
  understandable forms** for the same concept.
- Any non-rejected alternate is **accepted as input** (a listener understands it),
  even though only the preferred form is **produced as output**.
- A generated compound is good if **another root-knower would likely understand it.**

## Roots are still central

We do **not** abandon roots. Roots are the shared key. Everything else is built by
combining them. The experiment is about *how far a small set of roots can stretch.*

## The campfire test

Every root is gated by a simple thought experiment:

> Imagine two strangers stranded together with no common language.
> **Could this root realistically come up during their first week of interaction?**

- **Yes** → it belongs in the **communicative core**.
- **No** → it probably belongs in the **extended vocabulary** (or the complete
  language), not the core.

This test forces us to think like a speaker instead of a linguist. Nobody on day one
needs *transfer*, *signal*, or *pulse*. They need *hungry, hurt, water, friend,
help, danger, home, tomorrow, happy, afraid.* Those concepts make communication
possible; everything else is built on top of them.

## Roots are organized by human experience, not linguistic category

The inventory is grouped the way a person experiences the world:

| Tier | Experience | Examples |
| --- | --- | --- |
| 1 | **Survival & body** | person, eat, drink, sleep, pain, sick, hot, cold, see, hear, hand, eye, mouth |
| 2 | **Space & motion** | up, down, inside, outside, near, far, water, fire, earth, sky, tree, animal |
| 3 | **Social** | friend, family, help, share, give, take, work, leader, group |
| 4 | **Emotion** | love, fear, happy, sad, angry, calm, trust, hope, lonely, proud |
| 5 | **Time** | before, after, now, yesterday, tomorrow, always, never |
| 6 | **Thinking** | know, think, remember, forget, understand, learn, question |
| 7 | **Abstract** | equal, cause, change, value, system — *only when repeatedly proven necessary* |

Emotional, social, bodily, spatial, and survival concepts are **prioritized** over
abstract or computational concepts (signal, pulse, transfer, …). Abstraction is
admitted last, and only when it repeatedly proves necessary.

## The tiered language

Fonoran is not one flat vocabulary. It grows in three rings:

```text
Communicative Core   ~50 roots    the experiment: "how much can two people communicate with only 50?"
        ↓
Extended Core        ~100 roots   everyday fluency
        ↓
Complete Language    unlimited    specialized and abstract vocabulary
```

The experiment is **not** "can people learn 500 roots?" It is **"how much can two
people communicate with only 50?"** — a measurable question.

## Grammar stays minimal and context-driven

- Grammar describes **relationships between concepts**, nothing more.
- **Present tense is inferred.** Only past (`ta`) and future (`sa`) are marked.
- No conjugation, declension, gender, or plural endings. A word is invariant.
- Polarity is grammar, not vocabulary (`no` + *true* = false).
- See [fonoran-grammar.md](fonoran-grammar.md) for the full rules.

## How we judge understandability

Understandability is judged in two layers, and the layers are **not** equal:

1. **An automated heuristic** estimates communicative success — transparency,
   simplicity, ambiguity, and root familiarity. It **ranks** candidate expressions.
   It is a *ranking aid only*. It is never the authority.
2. **Human "guess-the-meaning" playtests** decide. A compound is preferred when real
   root-knowers recover its meaning. Where the score and the playtest disagree, **the
   playtest wins.**

> The score estimates communicative success. Recovery by humans *is* communicative
> success.

## Puzzle conversation

Fonoran must support **puzzle conversation**: speakers try a combination, sometimes
fail, then repair and clarify until meaning is recovered. The tools exist to make
this loop fast, to record what worked, and to let the language learn from real
attempts rather than from a designer's intuition alone.

## Working principles (for contributors and generators)

- Do **not** treat a compound as one correct canonical answer.
- Treat compounds as meaning attempts / communicative strategies.
- The dictionary may have preferred forms, but must also track alternate
  understandable forms.
- Roots are central. Do not abandon them.
- Judge any generated compound by *"would another root-knower likely understand
  this?"* — not by *"is this the most technically correct decomposition?"*
- Avoid over-engineered ontology work unless it directly improves learnability or
  communication.
- Favor simple, human-experience concepts over technical abstractions.

## Related

- [fonoran-grammar.md](fonoran-grammar.md) — syntax and composition rules
- [fonoran.md](fonoran.md) — the builder, data files, and pipeline
- [fonoran-interpretive-translator.md](fonoran-interpretive-translator.md) — translator design
