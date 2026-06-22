# Language Rules

## Configuration

| key | value |
| --- | ----- |
| fonora_version | v3 |
| ipa_vowel_mode | v3 |

## Places of Articulation

The **5 primary places** — edit symbols here; the sound grid and vowels recompose automatically.

| id | symbol | key_number | key_letter | label | sound | explanation |
| --- | --- | ---: | --- | --- | --- | --- |
| lips | ∋ | 1 | p | Lips | p | Lips/front-most articulation |
| front_tongue | ∩ | 2 | t | Front Tongue | t | Front tongue/alveolar or dental articulation |
| middle_tongue | ⌓ | 3 | c | Middle Tongue | c | Middle tongue/palatal or post-alveolar articulation |
| back_tongue | ∪ | 4 | k | Back Tongue | k | Back tongue/velar articulation |
| throat | ⊃ | 5 | h | Throat | h | Throat/glottal articulation |

## Modifiers

The **4 manner modifiers** plus the **vowel indicator** (keyboard **0**).

| id | symbol | key_number | key_letter | label | explanation |
| --- | --- | ---: | --- | --- | --- |
| vowel | ⚬ | 0 | 0 | Vowel | Vowel indicator; prefixes all vowel spellings |
| voice | ⌇ | 6 | b | Voice | Adds voicing to a place sound |
| friction | ⌀ | 7 | d | Friction | Adds friction/fricative quality |
| nasal | ⏌ | 8 | j | Nasal | Adds nasal airflow |
| glide | ᵔ | 9 | g | Glide | Transition between vowel positions; used in diphthongs and grid glide consonants |

## Sound Grid

Symbols are **composed** from Places + Modifiers at load time (`modifier + place`). Five places only — no derived symbols.

| modifier_id | place_id | sound | ipa | status | explanation |
| --- | --- | --- | --- | --- | --- |
| plain | lips | p | /p/ | defined | Plain lips stop |
| plain | front_tongue | t | /t/ | defined | Plain front tongue stop |
| plain | middle_tongue | c | /tʃ/ or /c/ | defined | Plain middle tongue stop/affricate placeholder |
| plain | back_tongue | k | /k/ | defined | Plain back tongue stop |
| plain | throat | h | /h/ | defined | Plain throat sound (glottal fricative) |
| voice | lips | b | /b/ | defined | Voiced lips sound |
| voice | front_tongue | d | /d/ | defined | Voiced front tongue sound |
| voice | middle_tongue | j | /dʒ/ | defined | Voiced middle tongue sound |
| voice | back_tongue | g | /g/ | defined | Voiced back tongue sound |
| voice | throat | ? | ? | reserved | Open research gap |
| friction | lips | f | /f/ | defined | Friction lips sound |
| friction | front_tongue | s | /s/ | defined | Friction front tongue sound |
| friction | middle_tongue | sh | /ʃ/ | defined | Friction middle tongue sound |
| friction | back_tongue | x | /x/ | defined | Friction back tongue sound |
| friction | throat | ? | ? | reserved | Open research gap |
| nasal | lips | m | /m/ | defined | Nasal lips sound |
| nasal | front_tongue | n | /n/ | defined | Nasal front tongue sound |
| nasal | middle_tongue | ñ | /ɲ/ | defined | Nasal middle tongue sound |
| nasal | back_tongue | ng | /ŋ/ | defined | Nasal back tongue sound |
| nasal | throat | ? | ? | reserved | Open research gap |
| glide | lips | w | /w/ | defined | Glide lips sound |
| glide | front_tongue | y | /j/ | defined | Glide front tongue sound |
| glide | middle_tongue | r | /r/ | defined | Glide middle tongue sound |
| glide | back_tongue | l | /l/ | defined | Glide back tongue sound |
| glide | throat | ? | ? | reserved | Open research gap |

## Vowels

Vowels use a fixed **v3 grammar** (no double-vowel marker):

* **Simple vowel:** `⚬X` — exactly 2 symbols (`X` = vowel class: place or manner glyph)
* **Diphthong:** `⚬XᵔY` — exactly 4 symbols (`ᵔ` = glide; `Y` = destination articulation place)

Recipe tokens: `vowel` → **⚬**; place ids and manner ids (`voice`, `friction`, `nasal`) compose `X`; `glide` → **ᵔ**; trailing place id → `Y`.

**Mapping rule:** IPA tokens in each table are authoritative. English words in *Example* are teaching aids only.

### Simple Vowels (⚬X)

| key | recipe | ipa | lexical_set | example |
| --- | --- | --- | --- | --- |
| ee | vowel, front_tongue | i, iː | FLEECE | see |
| i | vowel, middle_tongue | ɪ | KIT | sit |
| e | vowel, voice | ɛ, e, eː | DRESS / FACE base | bed |
| a | vowel, throat | ʌ, ə, ɐ, a | CUP / schwa / open | cup |
| ae | vowel, friction | æ | TRAP | cat |
| o | vowel, back_tongue | ɑ, ɒ, ɔ, ɑː, ɔː | LOT / THOUGHT | father |
| oh | vowel, nasal | o, oː, oʊ, əʊ | GOAT | go |
| u | vowel, lips | ʊ, u, uː, ʉ, ɯ | FOOT / GOOSE | book / boot |

### Diphthongs (⚬XᵔY)

| key | recipe | ipa | lexical_set | example |
| --- | --- | --- | --- | --- |
| eye | vowel, throat, glide, front_tongue | aɪ | PRICE | pie |
| ow | vowel, throat, glide, lips | aʊ | MOUTH | now |
| oy | vowel, back_tongue, glide, front_tongue | ɔɪ | CHOICE | boy |
| ay | vowel, voice, glide, front_tongue | eɪ | FACE | say |

Phoneme keys (`ee`, `i`, `ae`, …) are encoder identifiers. Sound Grid and Alphabet UIs are generated from these tables at load time.

## IPA Supplemental Mappings

| ipa | fonora_phoneme |
| --- | --- |
| ɚ | a, r |

## Derived / Reserved Sounds

Non-grid orderings composed from primary symbols at load time (reversed `place + modifier` or modifier pairs).

| sound | composition | ipa | status | explanation |
| --- | --- | --- | --- | --- |
| th | reverse_front_tongue_friction | /θ/ | defined | Voiceless dental fricative |
| dh | reverse_front_tongue_voice | /ð/ | defined | Voiced dental fricative |
| v | reverse_lips_voice | /v/ | defined | Reversed lips+voice ordering |
| z | reverse_friction_voice | /z/ | defined | Voiced counterpart of /s/ |

## Notes

* **Symbol core:** 5 places + 4 manner modifiers + **⚬** vowel indicator (keyboard 0).
* **V3 vowel grammar:** simple = 2 symbols; diphthong = 4 symbols. The legacy double-vowel marker **⚬⚬** is not used.
* **language-rules.md** supplies structure and default symbols; Alphabet tab overrides replace primaries for browser testing.
* Consonant IPA→phoneme normalization is documented in [docs/ipa-normalize.md](docs/ipa-normalize.md) and enforced by `npm test`.
* Sound grid, vowels, derived sounds, and CV examples recompose from active primaries on load.
* Do not use ASCII `=` (U+003D) as a symbol.
