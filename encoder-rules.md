# Legacy Encoder Rules

This document describes how the **Legacy Encoder** converts **English spelling** into **approximate spoken sounds**, then into **Fonora symbols**.

> **Note:** The IPA pipeline (eSpeak NG → IPA → Fonora) is now the preferred architecture. This legacy encoder exists for comparison and migration only.

Fonora is **phonetic, not spelling-based**. Words with the same approximate pronunciation should normalize to the same sound form and produce the same Fonora output.

Symbol mapping (sound → Fonora symbols) lives in [`language-rules.md`](language-rules.md). This file covers everything **before** symbol lookup.

---

## Core principle

```
English spelling  →  pronunciation normalization  →  sound units  →  Fonora symbols
     (input)              (approximate speech)         (tokens)      (from language-rules.md)
```

Example — all three words should encode identically:

| Input   | Pronunciation form | Sound units | Notes                          |
| ------- | ------------------ | ----------- | ------------------------------ |
| `eight` | `at`               | `at`        | `eigh → a`                     |
| `ate`   | `at`               | `at`        | `a_e → a`, silent final `e`    |
| `ayt`   | `at`               | `at`        | `ay → a`                       |

---

## Pipeline stages

Each English word passes through these stages in order. The app exposes all stages in **Show encoding details** (Translator) and the **Encoder Testing** tab.

| Stage | Name                      | Example (`eight`) | Implemented in        |
| ----- | ------------------------- | ----------------- | --------------------- |
| 1     | Original input            | `eight`           | `js/normalize.js`     |
| 2     | Cleaned input             | `eight`           | lowercase, strip non-a-z |
| 3     | `-ed` suffix split        | (none)            | stem + suffix if applicable |
| 4     | Pronunciation rules       | `eigh → a`        | spelling patterns, magic-e, silent e |
| 5     | Normalized sound form     | `at`              | after vowel collapse + double-consonant collapse |
| 6     | Sound conversion          | (none for `eight`) | digraphs, soft c/g, silent `gh` |
| 7     | Sound units               | `a + t`           | tokenized sounds string |
| 8     | Fonora symbols            | `⊐⊐∩`             | `js/encode.js` + `language-rules.md` |
| 9     | Decoded back              | `at`              | `js/decode.js`        |

**Override path:** If the word exists in the glossary/dictionary, stages 4–7 are skipped and dictionary pronunciation + spelling are used instead (labeled **Dictionary override** in the UI).

---

## Module map

| File                   | Role                                              |
| ---------------------- | ------------------------------------------------- |
| `encoder-rules.md`     | Human-readable encoder spec (this file)           |
| `language-rules.md`    | Sound ↔ Fonora symbol mapping (authoritative)     |
| `js/normalize.js`      | Stages 1–7: English → sound units                 |
| `js/encode.js`         | Stage 8: sound units → Fonora symbols             |
| `js/decode.js`         | Stage 9: Fonora symbols → sounds                  |
| `js/encoder-pipeline.js` | Orchestrates full pipeline + debug output       |
| `js/encoder-test-sets.js` | Curated regression word lists                  |
| `js/tests.js`          | Automated unit tests                              |

When changing encoder behavior, update **this file first**, then mirror changes in `js/normalize.js`, and add tests in `js/tests.js`.

---

## Stage 2: Cleaning

- Lowercase the input
- Remove characters that are not `a–z` or `'`
- Empty input produces a warning and no output

---

## Stage 3: `-ed` suffix handling

Applied to the cleaned word **before** pronunciation rules, only when the word ends in `ed` and has length ≥ 4.

| Condition                         | Action                          | Example        |
| --------------------------------- | ------------------------------- | -------------- |
| ends in `eed`                     | skip (not past-tense `-ed`)     | `seed` unchanged |
| stem ends in `t` or `d`           | suffix `ed`                     | `wanted` → `want` + `ed` |
| stem ends in voiceless `p/k/f/s/x/h` | suffix `t`                   | `jumped` → `jump` + `t` |
| stem ends in `all`                | stem → `…ol`, suffix `d`        | `called` → `kold` |
| otherwise                         | suffix `d`                      | `played` → `play` + `d` |

The suffix is appended **after** sound conversion on the stem.

---

## Stage 4: Pronunciation normalization

Goal: convert English **spelling patterns** into an intermediate **pronunciation form** — a simplified letter string that approximates speech.

### Order of operations

Apply in this exact order. **Longest / most specific patterns first.**

1. Whole-word exceptions (if any)
2. Spelling pattern substitutions (table below)
3. Magic-e (`a_e`, `i_e`, `o_e`, `u_e`, `e_e`)
4. Silent final `e`
5. Long vowel collapse (macron letters → short vowels)
6. Double consonant collapse

### Whole-word exceptions

| Word    | Pronunciation form | Notes                                |
| ------- | ------------------ | ------------------------------------ |
| `one`   | `won`              | irregular                            |
| `their` | `dher`             | homophone with `there`               |

Add new exceptions here sparingly. Prefer pattern rules when possible.

### Spelling pattern substitutions

Applied top-to-bottom. Each rule fires once per pass (global replace within the word).

| Pattern | Replaces with | Debug note                         | Examples              |
| ------- | ------------- | ---------------------------------- | --------------------- |
| `eigh`  | `a`           | `eigh → a`                         | `eight`, `weigh`      |
| `augh`  | `af`          | `augh → af`                        | `laugh`, `draught`    |
| `ough`  | `uf`          | `ough → uf`                        | `enough`, `rough`     |
| `igh`   | `i`           | `igh → i`                          | `night`, `light`      |
| `ee`    | `ē`*          | `ee → e`                           | `meet`, `seed`        |
| `ea`    | `ē`*          | `ea → e (approximation)`           | `team`, `clean`       |
| `ai`    | `ā`*          | `ai → a`                           | `rain`, `mail`        |
| `ay`    | `ā`*          | `ay → a`                           | `say`, `day`, `ayt`   |
| `ei`    | `a`           | `ei → a (approximation)`           | `vein`, `sei`         |
| `ae`    | `a`           | `ae → a`                           | `sae`                 |
| `oa`    | `ō`*          | `oa → o`                           | `boat`, `road`        |
| `ow`    | `ō`*          | `ow → o`                           | `snow`, `slow`        |
| `oo`    | `ū`*          | `oo → u (approximation)`           | `moon`, `food`        |
| `ew`    | `ū`*          | `ew → u`                           | `pew`, `few`          |
| `oe`    | `ō`*          | `oe → o`                           | `toe`, `poe`          |
| `ie`    | `ī`*          | `ie → i`                           | `pie`, `tie`          |

\* Rules marked with macron (`ā`, `ē`, etc.) are collapsed to short vowels in step 5. Fonora currently maps long and short vowels to the **same** two-symbol vowel forms (see `language-rules.md`).

**Critical ordering:** `eigh` must run **before** silent `gh` handling in stage 6. Otherwise `eight` incorrectly becomes `eit`.

### Magic-e (silent final e that lengthens the vowel)

Applied when the word is **not** in the magic-e exception list.

| Pattern              | Effect            | Debug note    | Example                    |
| -------------------- | ----------------- | ------------- | -------------------------- |
| `a_e`, `i_e`, `o_e`, `u_e` | long vowel + consonants | `{v}_e → {macron}` | `make` → `māk` → `mak` |
| `e_ce` (single consonant)  | long `e`          | `e_e → e`     | `pete` → `pēt` → `pet`     |

**Magic-e exceptions** (vowel is **not** lengthened):  
`have`, `give`, `live`, `love`, `come`, `some`, `done`, `gone`, `once`, `where`

### Silent final `e`

Remove trailing `e` when it is not pronounced, **after** magic-e processing.

**Do not strip** for these whole words:  
`the`, `he`, `me`, `we`, `be`

Also skip when:
- word length ≤ 2
- ends in `le` or `re`
- previous character is already a macron vowel (magic-e already consumed the `e`)

Debug note: `silent final e removed`

### Long vowel collapse

All macron vowels (`ā`, `ē`, `ī`, `ō`, `ū`) collapse to short letters (`a`, `e`, `i`, `o`, `u`).

Debug note: `long vowel collapsed to short vowel representation`

This matches the current experimental vowel policy in `language-rules.md`: long and short vowels encode to the same Fonora symbols.

### Double consonant collapse

Consecutive identical consonants collapse to one, **except** double `s`.

Debug note: `double {c} → single`

| Input    | After collapse |
| -------- | -------------- |
| `hello`  | `helo`         |
| `letter` | `leter`        |
| `shell`  | `shel`         |
| `pass`   | `pass` (ss kept) |

---

## Stage 6: Sound conversion

The pronunciation form is scanned left-to-right. **Multi-character clusters are matched before single letters.**

### Digraph and cluster rules

| Spelling | Sound output | Debug note                    | Notes                          |
| -------- | -------------- | ----------------------------- | ------------------------------ |
| `sh`     | `sh`           | —                             |                                |
| `ng`     | `ng`           | —                             |                                |
| `ph`     | `f`            | `ph → f`                      | `phone` → `fon`                |
| `ck`     | `k`            | `ck → k`                      | `back` → `bak`                 |
| `qu`     | `kw`           | `qu → kw approximation`       | `quick` → `kwik`               |
| `wh`     | `w`            | `wh → w`                      | `white` → `wit`                |
| `wr`     | `r`            | `wr → r`                      | `write` → `rit`                |
| `kn`     | `n`            | `kn → n`                      | `know` → `no`                  |
| `gn`     | `n`            | `gn → n`                      |                                |
| `ch`     | `c`          | `ch → c`   | English affricate approximation |
| `th`     | `th` or `dh`   | —                             | voiced list below              |
| `mb`     | `m`            | `mb → m`                      | word-final only (`lamb`)       |
| `gh`     | (removed)      | `silent gh removed`           | only if not consumed by `eigh`/`igh`/`augh` |

### Voiced `th` → `dh`

These words use `dh` instead of `th`:

`the`, `this`, `that`, `these`, `those`, `them`, `then`, `there`, `their`, `they`, `thus`, `thy`

### Soft `c` and soft `g`

| Letter | Condition              | Output | Debug note              |
| ------ | ---------------------- | ------ | ----------------------- |
| `c`    | before `e`, `i`, or `y` | `s`   | `c → s before e/i/y`    |
| `c`    | otherwise              | `k`    | `c → k (hard c)`        |
| `g`    | before `e`, `i`, or `y` | `j`   | `g → j before e/i/y`    |
| `g`    | otherwise              | `g`    | —                       |

### Unresolved / approximate sounds

| Letter | Behavior                                         |
| ------ | ------------------------------------------------ |
| `z`    | maps to `s` as a temporary testing approximation |

Debug note: `z → s approximation`

---

## Stage 8: Sound → Fonora symbols

Handled by `js/encode.js`. Uses **longest-match** over all defined sounds from `language-rules.md`:

- Sound grid (defined cells)
- Special derived sounds (`th`, `dh`)
- Experimental derived sounds (`v`)
- Experimental vowels (`a`, `e`, `i`, `o`, `u`)

Unknown sound units produce `?` in output and a warning.

**Do not define English→sound rules here.** That belongs in stages 4–6 above.

---

## Worked examples

### `eight`

```
Original:              eight
Cleaned:               eight
Pronunciation rules:   eigh → a
Normalized sound form: at
Sound conversion:      (none)
Sound units:           a + t
Fonora:                ⊐⊐∩   (a=⊐⊐, t=∩)
```

### `ate`

```
Original:              ate
Cleaned:               ate
Pronunciation rules:   a_e → ā
                       long vowel collapsed to short vowel representation
Normalized sound form: at
Sound units:           a + t
Fonora:                ⊐⊐∩
```

### `hello`

```
Original:              hello
Cleaned:               hello
Pronunciation rules:   double l → single
Normalized sound form: helo
Sound units:           h + e + l + o
Fonora:                …
```

### `phone`

```
Original:              phone
Cleaned:               phone
Pronunciation rules:   a_e → ā → a; silent final e removed
Normalized sound form: fon
Sound conversion:      ph → f
Sound units:           f + o + n
Fonora:                …
```

---

## Same-sound regression groups

These groups **must** produce identical normalized sound forms and identical Fonora output.

### Group 1 — long A /eɪ/

`eight`, `ate`, `ayt` → `at`

### Group 2 — long A via spelling variants

`rain`, `rane`, `rayn` → `ran`

### Group 3 — long A /eɪ/ alternate spellings

`say`, `sei`, `sae` → `sa`

### Group 4 — long E

`see`, `sea` → `se`

### Group 5 — long E cluster

`meet`, `meat` → `met`

### Group 6 — long O

`toe`, `tow` → `to`

### Group 7 — long A extended

`rain`, `rane`, `rayn`, `reign` → `ran`

### Group 8 — long I

`night`, `nite` → `nit`

### Group 9 — F spelling variants

`phone`, `fone` → `fon`

### Group 10 — silent letter pairs

`right`, `write` → `rit`

`know`, `no` → `no`

### Group 11 — voiced TH homophones

`there`, `their` → `dher` (homophone override on `their`)

Run automated checks:

```bash
npm test
```

Or use **Encoder Testing → Same-sound groups** in the app.

---

## Known limitations

These are intentional approximations, not bugs:

- Unstressed vowels / schwa are not currently modeled. Words like "hello" may encode spelling-based vowel approximations rather than full spoken stress patterns.
- English spelling is ambiguous; homographs are not disambiguated by context
- `ei` always maps to long A (breaks words like `receive` — use dictionary override)
- `ch` maps to middle-tongue stop `c` (`⌒`), not fricative `sh`
- `z` maps to `s` as a temporary testing approximation
- Long vowels are collapsed to short vowel letters before encoding
- `-ed` past-tense rules are simplified
- Glossary/dictionary entries override all normalization for that word

---

## Maintenance checklist

When adding or changing a rule:

1. **Document it here** in the appropriate table (pattern order matters)
2. **Update** `js/normalize.js` to match
3. **Add a test** in `js/tests.js` (or a word to `js/encoder-test-sets.js`)
4. **Verify** in Encoder Testing tab with **Show encoding details**
5. **Do not change** `language-rules.md` unless the Fonora symbol mapping itself changes

### Future: MD-driven rules

`language-rules.md` is parsed at runtime. This file is currently **documentation only**; rules are implemented in `js/normalize.js`. A future improvement could parse `encoder-rules.md` the same way, so encoder logic is editable without touching JavaScript.

---

## Related files

- [`language-rules.md`](language-rules.md) — Fonora symbol system (places, modifiers, grid, vowels)
- [`README.md`](README.md) — how to run the app and run tests
