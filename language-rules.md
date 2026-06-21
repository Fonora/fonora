# Language Rules

## Configuration

| key | value |
| --- | ----- |
| fonora_version | v2 |
| ipa_vowel_mode | v2 |

## Places of Articulation

The **5 primary places** — edit symbols here; the sound grid and vowels recompose automatically.

| id | symbol | key_number | key_letter | label | sound | explanation |
| --- | --- | ---: | --- | --- | --- | --- |
| lips | ⊟ | 1 | p | Lips | p | Lips/front-most articulation |
| front_tongue | ∩ | 2 | t | Front Tongue | t | Front tongue/alveolar or dental articulation |
| middle_tongue | ◠ | 3 | c | Middle Tongue | c | Middle tongue/palatal or post-alveolar articulation |
| back_tongue | ∪ | 4 | k | Back Tongue | k | Back tongue/velar articulation |
| throat | ⊃ | 5 | h | Throat | ? | Throat/glottal articulation |

## Modifiers

The **4 primary modifiers**.

| id | symbol | key_number | key_letter | label | explanation |
| --- | --- | ---: | --- | --- | --- |
| voice | ⌇ | 6 | b | Voice | Adds voicing to a place sound |
| friction | ⌀ | 7 | d | Friction | Adds friction/fricative quality |
| nasal | ⏌ | 8 | j | Nasal | Adds nasal airflow |
| glide | ⌣ | 9 | g | Glide / Liquid | Creates glide or liquid sounds |

## Writing Conventions

Derived symbols improve readability. They are **not** places of articulation and **do not** appear in the sound grid.

| id | symbol | label | expands_to | explanation |
| --- | --- | --- | --- | --- |
| vowel_carrier | ⊇ | Long vowel marker | — | Standalone long-vowel plane; visually extends ⊃. Not an abbreviation for any symbol sequence. |

## Sound Grid

Symbols are **composed** from Places + Modifiers at load time (`modifier + place`). Five places only — no derived symbols.

| modifier_id | place_id | sound | ipa | status | explanation |
| --- | --- | --- | --- | --- | --- |
| plain | lips | p | /p/ | defined | Plain lips stop |
| plain | front_tongue | t | /t/ | defined | Plain front tongue stop |
| plain | middle_tongue | c | /tʃ/ or /c/ | defined | Plain middle tongue stop/affricate placeholder |
| plain | back_tongue | k | /k/ | defined | Plain back tongue stop |
| plain | throat | ? | ? | undefined | Open research gap |
| voice | lips | b | /b/ | defined | Voiced lips sound |
| voice | front_tongue | d | /d/ | defined | Voiced front tongue sound |
| voice | middle_tongue | j | /dʒ/ | defined | Voiced middle tongue sound |
| voice | back_tongue | g | /g/ | defined | Voiced back tongue sound |
| voice | throat | ? | ? | undefined | Open research gap |
| friction | lips | f | /f/ | defined | Friction lips sound |
| friction | front_tongue | s | /s/ | defined | Friction front tongue sound |
| friction | middle_tongue | sh | /ʃ/ | defined | Friction middle tongue sound |
| friction | back_tongue | x | /x/ | defined | Friction back tongue sound |
| friction | throat | h | /h/ | defined | Friction throat sound |
| nasal | lips | m | /m/ | defined | Nasal lips sound |
| nasal | front_tongue | n | /n/ | defined | Nasal front tongue sound |
| nasal | middle_tongue | ñ | /ɲ/ | defined | Nasal middle tongue sound |
| nasal | back_tongue | ng | /ŋ/ | defined | Nasal back tongue sound |
| nasal | throat | ? | ? | undefined | Open research gap |
| glide | lips | w | /w/ | defined | Glide lips sound |
| glide | front_tongue | y | /j/ | defined | Glide front tongue sound |
| glide | middle_tongue | r | /r/ | defined | Glide middle tongue sound |
| glide | back_tongue | l | /l/ | defined | Glide back tongue sound |
| glide | throat | ? | ? | undefined | Open research gap |

## Vowels

Vowels are composed from a **length plane** + **articulation component** at load time.

* **Short plane** (`⊃`): short vowel — throat prefix + place component; open vowel uses `⊃` alone.
* **Long plane** (`⊇`): long vowel — long marker + place component; long open uses `⊇` alone.

The horizontal line in `⊇` visually communicates extension/length relative to `⊃`.

**Mapping rule:** IPA tokens in the table below are authoritative. English words in the *Example* column are teaching aids only.

| vowel | plane | component | symbol | ipa | description | example |
| --- | --- | --- | --- | --- | --- | --- |
| a | primary | throat | ⊃ | ʌ, ə, ɐ | Short open (central) | cup (ʌ), about (ə) |
| e | primary | front_tongue | ⊃∩ | æ, ɛ, e, ɜ | Short front | bed (ɛ); cat (æ) |
| i | primary | middle_tongue | ⊃◠ | ɪ | Short middle (lax high front) | bit |
| o | primary | back_tongue | ⊃∪ | ɑ, ɒ, ɔ, o, ø, œ | Short back | hot (ɑ) |
| u | primary | lips | ⊃⊟ | ʊ | Short rounded | book |
| ā | alternate | throat | ⊇ | aː | Long open (central cardinal) | Saal (DE /aː/) |
| ē | alternate | front_tongue | ⊇∩ | eː, ɛː, ɜː | Long front | — |
| ī | alternate | middle_tongue | ⊇◠ | i, iː, y, yː | Long/tense middle | see (iː) |
| ō | alternate | back_tongue | ⊇∪ | ɑː, oː, ɔː | Long back | father (ɑː); law (ɔː) |
| ū | alternate | lips | ⊇⊟ | u, uː, ʉ, ɯ | Long/tense rounded | boot (uː) |

### Vowel symbol reference

| Symbol | IPA (primary) | Description |
| --- | --- | --- |
| ⊃ | /ʌ/ | Short open (central) |
| ⊃∩ | /ɛ/ | Short front |
| ⊃◠ | /ɪ/ | Short middle |
| ⊃∪ | /ɑ/ | Short back |
| ⊃⊟ | /ʊ/ | Short rounded |
| ⊇ | /aː/ | Long open (central) |
| ⊇∩ | /eː/ | Long front |
| ⊇◠ | /i/ | Long/tense middle |
| ⊇∪ | /ɑː/ | Long back |
| ⊇⊟ | /u/ | Long/tense rounded |

Internal phoneme keys (`a`, `ā`, `e`, …) are encoder identifiers only.

### Known compression tradeoffs

* Short back **⊃∪** intentionally groups /ɑ, ɒ, ɔ, o/ — LOT, THOUGHT, and monophthong GOAT may share a symbol unless length (`ː`) or diphthongs (`oʊ`) apply.
* Diphthongs map via [IPA Supplemental Mappings](#ipa-supplemental-mappings), not the vowel table.
* Symbol sequences like `⊇` + `∩` (long open + /t/) can homograph with `⊇∩` (long front) — see Notes.

## IPA Supplemental Mappings

| ipa | fonora_phoneme |
| --- | --- |
| ɚ | a, r |
| aɪ | a, i |
| aʊ | a, u |
| eɪ | e, i |
| oʊ | o, u |
| əʊ | o, u |
| ɔɪ | o, i |
| ɪə | i, e |
| eə | e, e |
| ʊə | u, e |

## Derived Sounds

Non-grid orderings composed from primary symbols at load time (reversed `place + modifier` or modifier pairs).

| sound | composition | ipa | status | explanation |
| --- | --- | --- | --- | --- |
| th | reverse_front_tongue_friction | /θ/ | defined | Voiceless dental fricative |
| dh | reverse_front_tongue_voice | /ð/ | defined | Voiced dental fricative |
| v | reverse_lips_voice | /v/ | experimental | Reversed lips+voice ordering |
| z | reverse_friction_voice | /z/ | defined | Voiced counterpart of /s/ |

## Notes

* **9-symbol core:** 5 places + 4 modifiers. **⊇** is the long-vowel plane marker — not an articulation place and not shorthand for `⊃⊃`.
* **language-rules.md** supplies structure and default symbols; Alphabet tab overrides replace primaries for browser testing.
* Sound grid, vowels, derived sounds, and CV examples recompose from active primaries on load.
* Short and long vowels produce **distinct** Fonora spellings (e.g. `pa` ⊟⊃ vs `pā` ⊟⊇).
* **Homograph warning:** `⊇∩` (long front vowel) is identical to `⊇` + `∩` (long open + /t/). Disambiguation requires phonotactic context or phoneme-level encoding.
* Do not use ASCII `=` (U+003D) as a symbol.
