# Algorithm: how English becomes Fonoran

> **One page. The deterministic translator, start to finish.**
> Code: the engine in [`tools/fonoran-translator.js`](../tools/fonoran-translator.js) (`translateFromSource`; `translateEnglishLegacy` is its English-parser wrapper), the parser boundary in [`tools/fonoran-source-parsers.js`](../tools/fonoran-source-parsers.js), the English parser in [`tools/fonoran-source-english.js`](../tools/fonoran-source-english.js) with English reading in [`tools/fonoran-english-parse.js`](../tools/fonoran-english-parse.js), word lookup in [`tools/fonoran-english-resolve.js`](../tools/fonoran-english-resolve.js).
> No model is involved. It needs no API key, costs nothing, and returns instantly.
> It is the default engine. `legacy` and `lexical` are older names for it in scripts and tests.
>
> `sourceLang` selects a parser from the registry; English is the one installed today. Steps 1 and 2 below are the English parser's side of the boundary, and everything from step 3 on is the language-neutral engine. A parser hands the engine roles, source surfaces, concept hints, and grammar facts named by particle id — never a Fonoran spelling. A language with no parser is refused honestly rather than read as English.

## The governing rule

**It never guesses.** A word with no Fonoran form comes back in `unresolved[]` and appears bracketed in the output, rather than being approximated. An honest gap is worth more than a fluent sentence that means something else. Everything below serves that.

## Step 1: cut the input into sentences and words

The text is split into sentences. Each sentence is tokenized, then two merge passes run: multi-word English compounds become single tokens (`hot dog`), and phrasal verbs are joined (`give up`), because both are one concept, not two.

A sentence ending in `?`, or opening with an interrogative, is marked as a question. That flag matters later: the English `?` is a signal to read, never something copied to the output.

## Step 2: read the English with an off-the-shelf tagger

English word class comes from [`wink-nlp`](https://winkjs.org/wink-nlp/), a third-party offline tagger, not from our own rules. It answers two questions we have no business answering ourselves: what part of speech is this word here, and what is its dictionary form. `travels` is a verb whose lemma is `travel`; `flew` is a verb whose lemma is `fly`.

A clause is split into predications first, because Fonoran has no subordination: `when she arrives, we will leave` is two statements, and the connector is reported rather than dropped. Multi-word lexicon entries and curated idioms are masked into single tokens before tagging, since `time traveler` and `at war` are one word to the lexicon and reading them word by word loses the entry.

Roles are then read off word class, never off position:

```text
Actor · Action · Target · Place · Time
```

The Action is the verb. The Actor is the head of the noun phrase before it, so a stacked adjective cannot displace it: `the tall man walks` is man, walk, tall. This replaced a hand-written pattern cascade whose fallback assigned slots by position, which made `tall` the Actor and `man` the Action while reporting no gaps at all. That cascade, roughly 1,600 lines of English constructions matched by hand, was deleted in July 2026 once coverage showed no test could reach it. There is one front end.

This is also where English grammar is consumed and discarded. Tense comes from verb form and becomes a particle rather than an ending; irregulars need no list of ours, since the tagger already reports `gave` as `give`. Negation words are re-emitted as the `no` particle in front of what they deny, scoped to their own clause. Ability and necessity modals become ordinary concepts before the Action. Words English marks and Fonoran does not (number, articles, degree adverbs) are dropped; everything else either resolves or is reported.

## Step 3: resolve each word to a concept, in a fixed tier order

For one word, the first tier that hits wins. The order is the whole point: certain routes are trustworthy and are tried before looser ones.

| Order | Tier | Confidence |
| --- | --- | --- |
| 1 | Pinned loanword from a glossary (proper nouns) | exact |
| 2 | Curated concept hint, including semantic bridges like `reason` to `think` | medium |
| 3 | Head noun of a phrase, resolved recursively | medium |
| 4 | Transparent phrase assembly over strong aliases only | medium |
| 5 | Strong alias, concept id, or lemma | **high** |
| 6 | Curated interpretation rule (spatial paths, classes, idioms) | medium |
| 7 | Nothing matched, emit a gap | none |

A **weak** alias never produces output. It is recorded as a curation suggestion for a human instead, which is how the lexicon grows without the translator inventing entries.

Once a concept is identified, its spelling comes from the approved roots, or from a compound's composition, or is built from parts. Retired spellings are resolved through their live concept id, so a respelled root does not need every downstream artifact rebuilt.

## Step 4: questions

Every question opens with the particle `ka`, polar and content alike, and no `?` is written at the end. The source terminator still closes the sentence as a plain `.`, which keeps readback pauses and sentence boundaries in multi-sentence output. There is still no interrogative *word*: in a sentence marked as a question, an English WH word expands into two ordinary concepts, the lexicalized `nohu` ("unknown") plus the **dimension** being asked about.

```text
who         →  ka … nohu ba     unknown person
what        →  ka … nohu to     unknown thing
where       →  ka … nohu che    unknown place
when        →  ka … nohu kan    unknown time
why         →  ka … nohu gak    unknown cause
how         →  ka … nohu moyu   unknown manner
how many    →  ka … nohu tan    unknown count
how much    →  ka … nohu tan    unknown count (same question; the noun is mass)
```

`ka` is what makes the composition unambiguous, since `nohu ba` without it names an unknown person rather than asking who. The expansion is applied **only** in questions, so a relative or subordinate `who` and `when` are left as ordinary words. English "how many" / "how much" are one interrogative ("what count?"), not manner-how plus a quantity value: see [fonoran-rulebook.md](fonoran-rulebook.md) Rule 11. Degree adjectives (*how far*) stay as a polar probe on the scale word for now.

## Step 5: order the output

```text
[scene time] · Actor · [ta/sa] · Action · Target · Place · modifiers
```

Lexical time expressions may front as scene-setting (`yesterday, before the rain, …`), but the tense particles `ta` and `sa` stay next to the Action rather than floating out with them. Modifier order is deliberately **not** re-sorted on this path: the English order is already the recoverable one, and sorting turned `near you` (`dal be`) into `be dal`.

A question gets `ka` prepended and its `?` written as a plain `.`; a statement keeps the source's `.` or `!`. Terminators exist for readback pauses and sentence boundaries, not to mark sentence type. Then the roman surface, the Fonora script, and a pronunciation line are rendered.

## Step 6: report what it could not do

Every output carries:

- `unresolved[]`, the English words with no Fonoran form
- `interpretations[]`, every word that resolved through a non-direct tier, with the reason, so a reader can audit the liberties taken
- the `frame`, showing the slot assignment
- `mode`, which is `discourse` for multi-sentence input

## What the tagger does not decide

A tagger knows English. It does not know Fonoran, and nothing off the shelf can:

| Job | Owner |
| --- | --- |
| Part of speech, lemma, clause shape | `wink-nlp` |
| Which of the 136 concepts an English word means | `data/localizations/en.json`, `data/fonoran-concept-bridges.json` |
| Slot order, particles, question marking, WH composition, gap reporting | this pipeline |

## What it looks like

```text
I can make fire.        →  mi hu kel dat.        know + make, ability as knowing how
We must run now.        →  gem dan les ginek.    need + run
I cannot walk.          →  mi no giti.           negation alone carries inability
Why are you here?       →  ka nohu gak be nam.
How do you make fire?   →  ka nohu moyu be kel dat.
How many people?        →  ka nohu tan ba.
How far is the water?   →  ka ye fet.            degree probe, deferred
```

## Where the truth lives

If this page and the code disagree, the code wins, and this page is the bug.

| Thing | Source |
| --- | --- |
| Parser contract, registry, neutral slot structure | `tools/fonoran-source-parsers.js` |
| English → neutral slots (clauses, masking, modals, tense) | `tools/fonoran-source-english.js` |
| Pipeline and slot ordering | `tools/fonoran-translator.js` |
| Word to concept resolution tiers | `tools/fonoran-english-resolve.js` |
| Curated interpretation rules | `tools/fonoran-interpretation.js` |
| Particles and WH composition | `data/fonoran-grammar-policy.json` |
| Grammar it implements | [fonoran-grammar.md](fonoran-grammar.md), [fonoran-rulebook.md](fonoran-rulebook.md) |
