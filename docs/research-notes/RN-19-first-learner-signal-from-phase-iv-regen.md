# First learner signal from Phase IV regen

> **TL;DR.** Phase IV rebuilt 111 compounds with teaching trees and fresh root spellings. The first live learner test — compiling a sentence in the Translator and browsing the Dictionary — produced immediate root-cluster recognition (`ye` = water) and audible transparent compounds (`telto`, `lekche`). Formal playtest volume is still ahead.

## Research Question

[RN-18](/research/notes/compound-reconstruction) rebuilt the compound inventory as teaching trees and meaning-attempts under the constitution. That answered *how* to regenerate vocabulary. This note asks the next question:

**Does the Phase IV regen actually teach in the ear and the sentence — before we treat the inventory as stable?**

## Hypothesis

If the regen succeeded, a root-knower should:

- **Recognize root clusters** after brief dictionary exposure (phonetic assignment groups related concepts).
- **Parse compiled sentences** into roots and compounds without rehearsing every word.
- **Eventually recover compound meaning** in Puzzle Conversation at rates that justify preferred forms.

Recognition in the Translator and Dictionary is necessary but not sufficient; puzzle recovery and production (typing/speaking) still need measurement.

## What we shipped (Phase IV regen)

| Layer | Result |
| --- | --- |
| Compounds | 111 curated entries (53 semantic-foundation demo trees + 60 live-only concepts) |
| Teaching trees | Chains such as `community → identity → tribe → war`, `exchange → money`, `shared_meaning → language` |
| Meaning-attempts | `ASSOCIATION_SEEDS` coverage 111/111; every concept carries heuristic alternates |
| Phonetics | Fresh root assignment after `npm run fonoran:reset`; no legacy spelling locks |
| Build | 111/111 compounds resolved; 0 dropped after boundary/spelling fixes |
| Tooling | `npm run fonoran:compound-audit`, `fonoran:regen-compounds`, `fonoran:playtest:baseline` |

Audit snapshot: [`docs/fonoran-compound-audit-latest.md`](../fonoran-compound-audit-latest.md) (0 critical findings post-regen).

Playtest smoke test: [`docs/fonoran-phase4-playtest-baseline.md`](../fonoran-phase4-playtest-baseline.md) — 14 priority teaching-tree concepts present in lab.

## First anecdote (Jul 2026)

**Setting:** Language lab, Translator tab, after browsing the Dictionary.

**Input (English):** *i want to eat food in the city*

**Output (Fonoran):**

```text
mi sak tel telto lekche
```

| Slot | English | Fonoran | Gloss |
| --- | --- | --- | --- |
| subject | i | mi | I |
| event | want | sak | want |
| object | eat | tel | eat |
| modifier | food | telto | eat + thing |
| modifier | city | lekche | many + place |

**Pattern discovery (Dictionary, ~5 seconds):** Any word heard or seen starting with **`ye`** was immediately treated as water-related (`ye` = primitive root *water*). The learner did not need a gloss key — onset clustering was enough to start guessing family membership while scrolling the dictionary.

**Interpretation:** Transparent segmentation (`tel` + `to` → `telto`) and priority-weighted easy syllables for core concepts appear to support *recognition* faster than the pre-regen inventory did in informal use. This is one session, one speaker, English-mediated — not proof of cross-lingual communication.

## Early interpretation

Three layers should stay separate in evaluation:

1. **Recognition** — hearing or reading a compound and inferring root families (Dictionary / sentence listening).
2. **Compilation** — mapping English intent to roots + grammar particles (Translator).
3. **Recovery** — guessing intended meaning from an unrehearsed compound (Puzzle Conversation).

Phase IV regen may already satisfy (1) and (2) for everyday sentences; (3) remains the constitution's hard test and is under-measured.

## Open experiments

| Tool | URL | Question | Sessions | Notes |
| --- | --- | --- | --- | --- |
| Dictionary | [/language#dictionary](/language#dictionary) | Do root clusters teach without glosses? | 1 | `ye` = water within ~5s browse |
| Translator | [/language#translator](/language#translator) | Do compiled sentences stay parseable? | 1 | food/city sentence above |
| Puzzle Conversation | [/language#puzzle](/language#puzzle) | Do root-knowers recover compound meaning? | 0 | 14 priority concepts in playtest baseline doc |
| Keyboard / spelling drills | [/](/) (platform home) | Can learners type what they hear? | 0 | RN-16 pipeline |

Session log (living document): [`docs/fonoran-learning-sessions-log.md`](../fonoran-learning-sessions-log.md).

## Evaluation criteria (before publishing this note)

Promote this note from **Open** to **Active** when:

- At least one structured session per tool (Dictionary, Translator, Puzzle, keyboard) is recorded in the session log.
- Playtest coverage exists on the core teaching-tree chain: `community`, `identity`, `tribe`, `war`, `language`.
- At least one explicit **failure to learn** case is documented (repair expected, not perfection).
- Heuristic understandability vs human recovery is compared for ≥10 compounds.

## Open Questions

- How deep can teaching trees go before spellings like `danbadehugatmespa` stop teaching and start memorizing?
- Does onset clustering (`ye`, `tel`, `dan`, …) hold for domains beyond water and body?
- Which compounds fail Puzzle Conversation despite high understandability scores?
- When should playtest evidence change a preferred form in [`data/fonoran-compounds.json`](../data/fonoran-compounds.json)?

## References

**Prior notes:** [RN-18 · Reconstructing compounds](/research/notes/compound-reconstruction), [RN-17 · Puzzle conversation](/research/notes/puzzle-conversation), [RN-15 · Compiling English into meaning](/research/notes/compiling-english-into-meaning)

**Documentation:** [`docs/fonoran-compound-audit-latest.md`](../fonoran-compound-audit-latest.md), [`docs/fonoran-phase4-playtest-baseline.md`](../fonoran-phase4-playtest-baseline.md)

**Interactive demo:** [Dictionary](/language#dictionary), [Translator](/language#translator), [Puzzle Conversation](/language#puzzle)

**Source:** [`data/fonoran-compounds.json`](../data/fonoran-compounds.json), [`tools/fonoran-compound-audit.js`](../tools/fonoran-compound-audit.js), [`data/fonoran-playtests.json`](../data/fonoran-playtests.json)
