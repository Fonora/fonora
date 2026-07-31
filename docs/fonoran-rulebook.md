# The Fonoran Rulebook

> **The whole language on one page, ground up.** Three layers, thirteen rules.
> This is the authority on what the rules are. The [script rules](language-rules.md) and the [grammar reference](fonoran-grammar.md) carry the same rules in more detail.

## The three layers

Two different things share the name. Keeping them apart is the single most useful thing to understand.

| Layer | Name | What it is | Analogy |
| --- | --- | --- | --- |
| 1 | **Fonora** | The writing system. Symbols for sounds | The Latin alphabet |
| 2 | **Fonoran words** | The vocabulary. Roots and compounds | English words |
| 3 | **Fonoran grammar** | How words combine | English syntax |

You could write English in Fonora script, and you could write Fonoran in the Latin alphabet. We do the latter constantly: `mi hu kel dat` is Fonoran written in Latin letters, which we call **roman**.

---

## Layer 1: The Script (3 rules)

Fonora writes **how your mouth makes the sound**, not which letter a tradition assigned. There are 9 building blocks: 5 places in the mouth and 4 ways of shaping air.

| The 5 places | Glyph | The 4 manners | Glyph |
| --- | --- | --- | --- |
| Lips | `∋` | Voice | `⌇` |
| Front tongue | `∩` | Friction | `⌀` |
| Middle tongue | `⌓` | Nasal | `⏌` |
| Back tongue | `∪` | Glide | `ᵔ` |
| Throat | `⊃` | | |

One more glyph, `⚬`, marks a vowel.

### Rule 1: One sound, one spelling, always

You write what you hear. A sound is always written the same way, everywhere, forever. There are no silent letters, no "gh" that sounds like "f", and no words you can say but not spell.

**What you hear = what you write = what you look up.**

### Rule 2: A consonant is a manner stacked on a place

Every consonant glyph is built, not memorized. Pick where in the mouth, pick what the air does, and combine them.

```text
∋   lips, air stopped        = p
⌇∋  lips + voice            = b
⏌∋  lips + nasal            = m
∩   front tongue            = t
⌇∩  front tongue + voice    = d
```

If you know the two halves, you can read a glyph you have never seen and pronounce it. You can also work backwards from a sound you hear to the glyph, which is why the script is learnable in minutes rather than months.

### Rule 3: A vowel is `⚬` plus a mouth position

Vowels reuse the same five places. The vowel marker `⚬` comes first, then the position your tongue moves to, ordered back to front:

```text
⚬∪  = a    (back tongue)
⚬⌓  = e    (middle tongue)
⚬∩  = i    (front tongue)
⚬⊃  = o    (throat)
⚬∋  = u    (lips)
```

A diphthong is a vowel that slides, so it adds the glide and a destination: `⚬X ᵔ Y`.

So the word `mi` is written `⏌∋⚬∩`, which reads literally as *nasal-at-lips, then vowel-at-front-tongue*. That is `m` + `i`.

---

## Layer 2: The Words (4 rules)

These four are enforced by the build, not by good intentions: a word that breaks them is rejected before it can enter the language.

### Rule 4: Anyone can say it

Roots use sounds that are easy across human languages. Only `a e i o u` for vowels. No `r` and no `j`, because those are exactly the sounds adults struggle with in a new language.

### Rule 5: You can hear the difference

If two words sound alike, one of them is wrong. In practice this means **no root may be the beginning of another root**. If `ka` is a root, `kat` cannot be, because hearing "kat" leaves you unsure whether the speaker finished.

### Rule 6: Compounds are legos, not codes

A compound must be guessable by someone who knows only its parts. Two or three roots preferred, four maximum.

```text
water + path        = river
collective + still  = law
sky + fire          = sun
```

You are not memorizing "river". You are recognizing water and path and drawing the obvious conclusion. This is the rule that lets a small vocabulary cover a large world, and it is the one that quietly fails most often, because a compound can be *technically* decodable and still be a riddle.

### Rule 7: No doubled consonants

A compound that would collide two identical consonants is rejected outright. `sannan` cannot be written `sannnan`, and allowing near-misses like that would break Rule 1.

### How the vocabulary is sized

| Ring | Who it is for | Roots |
| --- | --- | --- |
| 1, Campfire core | Two strangers, first hour | 50 |
| 2, Everyday | Second week | 100 cumulative |
| 3, Broad fluency | The ceiling | 150 cumulative |

**150 primitive roots, hard cap.** Everything past that is built by compounding. This is a deliberate constraint, not a milestone we hope to exceed.

---

## Layer 3: The Grammar (6 rules)

### Rule 8: One order, and the Actor is always spoken

```text
Actor  ->  Action  ->  Target / Place
```

Time floats to wherever it reads naturally.

```text
mi san be           I love you
mi gi ye            I go to the water
be sak gi yetem     do you want to go to the beach?
```

There are no case endings, so order is doing real work. It does not scramble freely.

Nothing is marked on the verb, so a clause with no Actor names nobody: `sak gi yetem` reads as *I want to go to the beach* just as readily as a question to you. One short word is not worth that.

### Rule 9: Words never change. Particles do the work

`dog` never becomes `dogs`. `help` never becomes `helped`. Nothing conjugates, nothing declines, nothing agrees. When English would change a word's shape, Fonoran adds a small separate word instead, from a **closed set of seven**:

| Particle | Job |
| --- | --- |
| *(nothing)* | present |
| `ta` | past |
| `sa` | future |
| `no` | not |
| `ya` | yes |
| `von` | if |
| `ka` | asks |
| `mi` | I, me |

```text
mi san be       I love you
mi ta san be    I loved you
mi sa san be    I will love you
```

Closed means closed. Adding a particle changes the grammar itself, not the vocabulary.

### Rule 10: `no` goes immediately before what it denies

Negation is positional, and its position *is* its meaning. It scopes over exactly the thing to its right.

```text
mi no gamdal         I am not dangerous       (denies the action)
mi gat no dakpa      I have no weapon         (denies the thing)
no kamgu             not safe                 (denies the quality)
```

In a two-clause sentence, a `no` in one clause does not reach into the other.

### Rule 11: Questions open with `ka`

Every question, yes/no or content, begins with `ka`. Nothing marks the end: the script has nine symbols and a question mark is not one of them. A sentence still closes with `.`, which says only that it ended.

```text
ka be len mi.       do you hear me?
be len mi.          you hear me
```

`ka` comes first for the same reason `no` comes before what it denies: a particle sits immediately before what it scopes over, and a question scopes the whole clause. It also means the listener knows a question is coming before assembling the sentence, rather than after.

For content questions, combine `nohu` ("unknown") with the **kind of thing** you are missing, and still open with `ka`:

```text
ka nohu ba.      unknown person   ->  who?
ka nohu che.     unknown place    ->  where?
ka nohu kan.     unknown time     ->  when?
ka nohu gak.     unknown cause    ->  why?
ka nohu moyu.    unknown manner   ->  how?
ka nohu tan.     unknown count    ->  how many? / how much?
```

The particle is what separates the question from the statement, because `nohu ba` on its own names an unknown person.

Note the pattern: `nohu` pairs with a **category**, never with an answer. There is no `nohu lek` ("unknown many"), because "many" is already an answer. Quantity is asked as **unknown count** (`ka nohu tan`): English "how many" and "how much" are one question ("what count?"), and the noun names what is counted. Fonoran does not mark the English count/mass split. Degree on a quality (*how far*, *how big*) is not this question and is left for later.

### Rule 12: Actions chain, and modality is just a word in the chain

Stack verbs directly. No infinitive marker, no auxiliary.

```text
mi sak gi           I want to go
mi hu kel dat       I can make fire      (know + make)
gem dan les ginek   we must run now      (need + run)
mi no giti          I cannot walk        (plain negation is enough)
```

Ability is *knowing how*. Necessity is *needing*. Possibility is `ketnat`, "maybe". None of these is a special grammatical form; they are ordinary words sitting in the action chain, which is why the grammar does not grow to accommodate them.

### Rule 13: "and" is nothing, "or" closes the group

Putting two things side by side already means both, so conjunction needs no word.

```text
mi nes mak saklo        I am cold and hungry
```

Choice needs a marker, because side by side would assert both. Close the group with `lu`, "a single one":

```text
lo ye lu                food or water   (food, water, one of them)
```

---

## One sentence through all three layers

**English:** I can make fire.

| Layer | Result |
| --- | --- |
| Concepts | speaker, know, make, fire |
| Grammar (Rules 8, 9, 12) | Actor `mi`, then the action chain `hu kel`, then the target `dat` |
| Words (Rule 6) | `hu` know, `kel` make, `dat` fire |
| Roman | `mi hu kel dat` |
| Fonora script (Rules 1 to 3) | `⏌∋⚬∩ ⊃⚬∋ ∪⚬⌓ᵔ∩ ⌇∩⚬∪∩` |

Read the script back and you get the sounds. Read the sounds and you get the words. Read the words and you get the meaning. No layer requires memorizing an exception from the layer below it.

---

## What the language cannot do yet

An honest rulebook lists its holes. As of this writing Fonoran has no comparison (*bigger than*), no aspect (*was running*), no relative clauses (*the person who left*), no implemented numbers, and no way to say *should* or to grant permission. Measured translation gaps live in `data/fonoran-translation-gap-baseline-deterministic.json`; run `npm run fonoran:translation-gaps` to refresh the count.

## Where the truth lives

If this page and a data file disagree, the data file wins.

| Layer | Canonical source |
| --- | --- |
| Script symbols and sounds | [docs/language-rules.md](language-rules.md) |
| The word rules, rings, caps | This page |
| Ring membership | [data/fonoran-root-rings.json](../data/fonoran-root-rings.json) |
| Particles | [data/fonoran-grammar-particles.json](../data/fonoran-grammar-particles.json) |
| Roots | [data/fonoran-approved-roots.json](../data/fonoran-approved-roots.json) |
| Compounds | [data/fonoran-compounds.json](../data/fonoran-compounds.json) |
| Full grammar reference | [docs/fonoran-grammar.md](fonoran-grammar.md) |
