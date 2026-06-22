# Fonora Collision Audit

Generated: 2026-06-22T04:31:27.388Z
Rules version: v3

## Executive summary

- **Exact symbol collisions:** 0
- **Concatenation → single-key collisions:** 4
- **Concatenation → sequence collisions:** 12
- **Greedy decoder hazards:** 17
- **Word-level boundary issues:** 3 (none)
- **v2 collision test scope:** 5 minimal-pair groups / 13 words — symbol distinctness only

The bar/boy/bor fix addressed **display labeling** and **boundary-aware round-trip** in the IPA pipeline. It does **not** remove underlying symbol ambiguity where `o + r` and `oy` share symbols, or where `th + t` and `t + s` share symbols.

## 1. Symbol inventory

| key | type | IPA | symbols | source | status | notes |
| --- | --- | --- | --- | --- | --- | --- |
| ? | grid | ? | `⌇⊃` | sound grid (voice+throat) | reserved | Open research gap |
| ? | grid | ? | `⌀⊃` | sound grid (friction+throat) | reserved | Open research gap |
| ? | grid | ? | `⏌⊃` | sound grid (nasal+throat) | reserved | Open research gap |
| ? | grid | ? | `ᵔ⊃` | sound grid (glide+throat) | reserved | Open research gap |
| a | vowel | ʌ, ə, ɐ, a | `⚬⊃` | vowel recipe | defined | CUP / schwa / open |
| ae | vowel | æ | `⚬⌀` | vowel recipe | defined | TRAP |
| ay | vowel | eɪ | `⚬⌇ᵔ∪` | vowel recipe | defined | FACE |
| b | grid | /b/ | `⌇∋` | sound grid (voice+lips) | defined | Voiced lips sound |
| c | grid | /tʃ/ or /c/ | `⌓` | sound grid (plain+middle_tongue) | defined | Plain middle tongue stop/affricate place |
| d | grid | /d/ | `⌇∩` | sound grid (voice+front_tongue) | defined | Voiced front tongue sound |
| dh | derived | /ð/ | `∩⌇` | derived (reverse_front_tongue_voice) | defined | Voiced dental fricative |
| e | vowel | ɛ, e, eː | `⚬⌇` | vowel recipe | defined | DRESS / FACE base |
| ee | vowel | i, iː | `⚬∩` | vowel recipe | defined | FLEECE |
| eye | vowel | aɪ | `⚬⊃ᵔ∪` | vowel recipe | defined | PRICE |
| f | grid | /f/ | `⌀∋` | sound grid (friction+lips) | defined | Friction lips sound |
| g | grid | /g/ | `⌇∪` | sound grid (voice+back_tongue) | defined | Voiced back tongue sound |
| h | grid | /h/ | `⊃` | sound grid (plain+throat) | defined | Plain throat sound (glottal fricative) |
| i | vowel | ɪ | `⚬⌓` | vowel recipe | defined | KIT |
| j | grid | /dʒ/ | `⌇⌓` | sound grid (voice+middle_tongue) | defined | Voiced middle tongue sound |
| k | grid | /k/ | `∪` | sound grid (plain+back_tongue) | defined | Plain back tongue stop |
| l | grid | /l/ | `ᵔ∩` | sound grid (glide+front_tongue) | defined | Glide front tongue sound (alveolar /l/) |
| m | grid | /m/ | `⏌∋` | sound grid (nasal+lips) | defined | Nasal lips sound |
| n | grid | /n/ | `⏌∩` | sound grid (nasal+front_tongue) | defined | Nasal front tongue sound |
| ñ | grid | /ɲ/ | `⏌⌓` | sound grid (nasal+middle_tongue) | defined | Nasal middle tongue sound |
| ng | grid | /ŋ/ | `⏌∪` | sound grid (nasal+back_tongue) | defined | Nasal back tongue sound |
| o | vowel | ɑ, ɒ, ɔ, ɑː, ɔː | `⚬∪` | vowel recipe | defined | LOT / THOUGHT |
| oh | vowel | o, oː, oʊ, əʊ | `⚬⏌` | vowel recipe | defined | GOAT |
| ow | vowel | aʊ | `⚬⊃ᵔ∋` | vowel recipe | defined | MOUTH |
| oy | vowel | ɔɪ | `⚬∪ᵔ∪` | vowel recipe | defined | CHOICE |
| p | grid | /p/ | `∋` | sound grid (plain+lips) | defined | Plain lips stop |
| r | grid | /r/ | `ᵔ⌓` | sound grid (glide+middle_tongue) | defined | Glide middle tongue sound |
| s | grid | /s/ | `⌀∩` | sound grid (friction+front_tongue) | defined | Friction front tongue sound |
| sh | grid | /ʃ/ | `⌀⌓` | sound grid (friction+middle_tongue) | defined | Friction middle tongue sound |
| t | grid | /t/ | `∩` | sound grid (plain+front_tongue) | defined | Plain front tongue stop |
| th | derived | /θ/ | `∩⌀` | derived (reverse_front_tongue_friction) | defined | Voiceless dental fricative |
| u | vowel | ʊ, u, uː, ʉ, ɯ | `⚬∋` | vowel recipe | defined | FOOT / GOOSE |
| v | derived | /v/ | `∋⌇` | derived (reverse_lips_voice) | defined | Reversed lips+voice ordering |
| w | grid | /w/ | `ᵔ∋` | sound grid (glide+lips) | defined | Glide lips sound |
| x | grid | /x/ | `⌀∪` | sound grid (friction+back_tongue) | defined | Friction back tongue sound |
| y | grid | /j/ | `ᵔ∪` | sound grid (glide+back_tongue) | defined | Glide back tongue sound (/j/ without ton |
| z | derived | /z/ | `⌀⌇` | derived (reverse_friction_voice) | defined | Voiced counterpart of /s/ |

_Full inventory: 71 rows (including 30 IPA map entries)._

## 2. Exact symbol collisions

No two distinct encodable phoneme keys share the exact same symbol string.

## 3. Concatenation collisions

| sequence A | sequence B | symbols | type | example risk | recommendation |
| --- | --- | --- | --- | --- | --- |
| o + y | oy | `⚬∪ᵔ∪` | sequence-equals-single | oy may encode as oy diphthong/composite | Known vowel+glide vs diphthong collision — requires symbol boundaries or recipe change (documented in language-rules homograph note) |
| e + y | ay | `⚬⌇ᵔ∪` | sequence-equals-single | ey may encode as ay diphthong/composite | Known vowel+glide vs diphthong collision — requires symbol boundaries or recipe change (documented in language-rules homograph note) |
| a + y | eye | `⚬⊃ᵔ∪` | sequence-equals-single | ay may encode as eye diphthong/composite | Known vowel+glide vs diphthong collision — requires symbol boundaries or recipe change (documented in language-rules homograph note) |
| a + w | ow | `⚬⊃ᵔ∋` | sequence-equals-single | aw may encode as ow diphthong/composite | Known vowel+glide vs diphthong collision — requires symbol boundaries or recipe change (documented in language-rules homograph note) |
| th + t | t + s | `∩⌀∩` | sequence-equals-sequence | tht vs ts share symbols | Language-design decision — distinct phoneme sequences indistinguishable without boundaries |
| th + p | t + f | `∩⌀∋` | sequence-equals-sequence | thp vs tf share symbols | Language-design decision — distinct phoneme sequences indistinguishable without boundaries |
| th + k | t + x | `∩⌀∪` | sequence-equals-sequence | thk vs tx share symbols | Language-design decision — distinct phoneme sequences indistinguishable without boundaries |
| th + c | t + sh | `∩⌀⌓` | sequence-equals-sequence | thc vs tsh share symbols | Language-design decision — distinct phoneme sequences indistinguishable without boundaries |
| dh + t | t + d | `∩⌇∩` | sequence-equals-sequence | dht vs td share symbols | Language-design decision — distinct phoneme sequences indistinguishable without boundaries |
| dh + p | t + b | `∩⌇∋` | sequence-equals-sequence | dhp vs tb share symbols | Language-design decision — distinct phoneme sequences indistinguishable without boundaries |
| dh + k | t + g | `∩⌇∪` | sequence-equals-sequence | dhk vs tg share symbols | Language-design decision — distinct phoneme sequences indistinguishable without boundaries |
| dh + c | t + j | `∩⌇⌓` | sequence-equals-sequence | dhc vs tj share symbols | Language-design decision — distinct phoneme sequences indistinguishable without boundaries |
| v + t | p + d | `∋⌇∩` | sequence-equals-sequence | vt vs pd share symbols | Language-design decision — distinct phoneme sequences indistinguishable without boundaries |
| v + p | p + b | `∋⌇∋` | sequence-equals-sequence | vp vs pb share symbols | Language-design decision — distinct phoneme sequences indistinguishable without boundaries |
| v + k | p + g | `∋⌇∪` | sequence-equals-sequence | vk vs pg share symbols | Language-design decision — distinct phoneme sequences indistinguishable without boundaries |
| v + c | p + j | `∋⌇⌓` | sequence-equals-sequence | vc vs pj share symbols | Language-design decision — distinct phoneme sequences indistinguishable without boundaries |

## 4. Greedy decoder hazards

`decodeSymbols()` uses longest-match on unsegmented symbol strings. `decodeToPhonemeKeys()` uses space boundaries when present.

| symbols | expected keys | greedy keys | spaced keys | spacing fixes? | notes |
| --- | --- | --- | --- | --- | --- |
| `∩⌀⌓` | t sh | th c | t sh | yes | phoneme keys [t sh] |
| `∩⌀⌇` | t z | th ? | t z | yes | phoneme keys [t z] |
| `∩⌀∪` | t x | th k | t x | yes | phoneme keys [t x] |
| `∩⌀∩` | t s | th t | t s | yes | phoneme keys [t s] |
| `∩⌇⌓` | t j | dh c | t j | yes | phoneme keys [t j] |
| `∩⌇∪` | t g | dh k | t g | yes | phoneme keys [t g] |
| `∩⌀∋` | t f | th p | t f | yes | phoneme keys [t f] |
| `∩⌇∩` | t d | dh t | t d | yes | phoneme keys [t d] |
| `∩⌇∋` | t b | dh p | t b | yes | phoneme keys [t b] |
| `∋⌇⌓` | p j | v c | p j | yes | phoneme keys [p j] |
| `∋⌇∪` | p g | v k | p g | yes | phoneme keys [p g] |
| `∋⌇∩` | p d | v t | p d | yes | phoneme keys [p d] |
| `∋⌇∋` | p b | v p | p b | yes | phoneme keys [p b] |
| `⚬∪ᵔ∪` | o y | oy | o y | yes | phoneme keys [o y] |
| `⚬⌇ᵔ∪` | e y | ay | e y | yes | phoneme keys [e y] |
| `⚬⊃ᵔ∪` | a y | eye | a y | yes | phoneme keys [a y] |
| `⚬⊃ᵔ∋` | a w | ow | a w | yes | phoneme keys [a w] |

## 5. Real word round-trip risks

| word | phoneme keys | recovered | unspaced recover | issues |
| --- | --- | --- | --- | --- |
| tht | a ee ay a a ee | ae e ay a ae e | ae e ay a ae e | recovered-keys-mismatch |
| ts | a ee e a | ae ee a | ae ee a | recovered-keys-mismatch |
| pb | a ee a ee | ae e ae e | ae e ae e | recovered-keys-mismatch |

### Full word table

| word | IPA | phoneme keys | symbols | recovered keys | unspaced | issues |
| --- | --- | --- | --- | --- | --- | --- |
| bar | bˈɑːɹ | a o r | `⚬⊃⚬∪ᵔ⌓` | a o r | a o r | — |
| boy | bˈɔɪ | a oy | `⚬⊃⚬∪ᵔ∪` | a oy | a oy | — |
| bor | bˈoːɹ | a oh r | `⚬⊃⚬⏌ᵔ⌓` | a oh r | a oh r | — |
| car | kˈɑːɹ | a o r | `⚬⊃⚬∪ᵔ⌓` | a o r | a o r | — |
| core | kˈoːɹ | a oh r | `⚬⊃⚬⏌ᵔ⌓` | a oh r | a oh r | — |
| coy | kˈɔɪ | a oy | `⚬⊃⚬∪ᵔ∪` | a oy | a oy | — |
| far | fˈɑːɹ | a o r | `⚬⊃⚬∪ᵔ⌓` | a o r | a o r | — |
| foy | fˈɔɪ | a oy | `⚬⊃⚬∪ᵔ∪` | a oy | a oy | — |
| for | fˈɔːɹ | a o r | `⚬⊃⚬∪ᵔ⌓` | a o r | a o r | — |
| saw | sˈɔː | a o | `⚬⊃⚬∪` | a o | a o | — |
| soar | sˈoːɹ | a oh r | `⚬⊃⚬⏌ᵔ⌓` | a oh r | a oh r | — |
| soy | sˈɔɪ | a oy | `⚬⊃⚬∪ᵔ∪` | a oy | a oy | — |
| hat | hˈæt | a ae a | `⚬⊃⚬⌀⚬⊃` | a ae a | a ae a | — |
| hot | hˈɑːt | a o a | `⚬⊃⚬∪⚬⊃` | a o a | a o a | — |
| hut | hˈʌt | a a a | `⚬⊃⚬⊃⚬⊃` | a a a | a a a | — |
| cat | kˈæt | a ae a | `⚬⊃⚬⌀⚬⊃` | a ae a | a ae a | — |
| cot | kˈɑːt | a o a | `⚬⊃⚬∪⚬⊃` | a o a | a o a | — |
| cut | kˈʌt | a a a | `⚬⊃⚬⊃⚬⊃` | a a a | a a a | — |
| bad | bˈæd | a ae a | `⚬⊃⚬⌀⚬⊃` | a ae a | a ae a | — |
| bod | bˈɑːd | a o a | `⚬⊃⚬∪⚬⊃` | a o a | a o a | — |
| bud | bˈʌd | a a a | `⚬⊃⚬⊃⚬⊃` | a a a | a a a | — |
| bake | bˈeɪk | a ay a | `⚬⊃⚬⌇ᵔ∪⚬⊃` | a ay a | a ay a | — |
| back | bˈæk | a ae a | `⚬⊃⚬⌀⚬⊃` | a ae a | a ae a | — |
| book | bˈʊk | a u a | `⚬⊃⚬∋⚬⊃` | a u a | a u a | — |
| boot | bˈuːt | a u a | `⚬⊃⚬∋⚬⊃` | a u a | a u a | — |
| eight | ˈeɪt | ay a | `⚬⌇ᵔ∪⚬⊃` | ay a | ay a | — |
| ate | ˈeɪt | ay a | `⚬⌇ᵔ∪⚬⊃` | ay a | ay a | — |
| hello | həlˈoʊ | a a a oh | `⚬⊃⚬⊃⚬⊃⚬⏌` | a a a oh | a a a oh | — |
| thin | θˈɪn | a i a | `⚬⊃⚬⌓⚬⊃` | a i a | a i a | — |
| this | ðˈɪs | a i a | `⚬⊃⚬⌓⚬⊃` | a i a | a i a | — |
| zoo | zˈuː | a u | `⚬⊃⚬∋` | a u | a u | — |
| buzz | bˈʌz | a a a | `⚬⊃⚬⊃⚬⊃` | a a a | a a a | — |
| music | mjˈuːzɪk | a a u a i a | `⚬⊃⚬⊃⚬∋⚬⊃⚬⌓⚬⊃` | a a u a i a | a a u a i a | — |
| father | fˈɑːðɚ | a o a a | `⚬⊃⚬∪⚬⊃⚬⊃` | a o a a | a o a a | — |
| palm | pˈɑːm | a o a | `⚬⊃⚬∪⚬⊃` | a o a | a o a | — |
| tht | tˌiːˌeɪtʃtˈiː | a ee ay a a ee | `⚬⌀⚬⌇⚬⌇ᵔ∪⚬⊃⚬⌀⚬⌇` | ae e ay a ae e | ae e ay a ae e | recovered-keys-mismatch |
| ts | tˌiːˈɛs | a ee e a | `⚬⌀⚬∩⚬⊃` | ae ee a | ae ee a | recovered-keys-mismatch |
| pb | pˌiːbˈiː | a ee a ee | `⚬⌀⚬⌇⚬⌀⚬⌇` | ae e ae e | ae e ae e | recovered-keys-mismatch |

## 6. Test suite review

### What `npm run test:minimal-pairs` actually tests

- Within-group distinct Fonora symbol strings (fonora field)
- Does NOT check exact symbol collisions in inventory
- Does NOT check phoneme-key concatenation collisions
- Does NOT check unspaced greedy decode hazards
- Recovered keys now space-separated — no longer English spellings

(`npm run test:v2-collisions` is a deprecated alias for the same script.)

### Misleading claims

- "0 collision groups" means minimal-pair groups have distinct symbol outputs — not zero symbol-system collisions
- Spacing in pipeline output can hide concatenation collisions during round-trip

### Recommended separate reports

- exact symbol collisions
- concatenation collisions (sequence vs single, sequence vs sequence)
- boundary-dependent round-trip failures
- word-level phoneme-key recovery mismatches

## 7. Recommended fix order (no language redesign yet)

1. **Documentation / UI (done partially):** Label recovered output as phoneme keys, not English spellings.
2. **Boundary convention (done in pipeline):** Space-separated symbol groups in IPA pipeline output; preserve boundaries in normalize.
3. **Human language-design decisions required:**
   - `o + r` vs `oy` (also affects `o + y`→`eye`, `o + w`→`ow`, `e + y`→`ay`)
   - `th + t` vs `t + s`, `dh + t` vs `t + d`, `v + p` vs `p + b` (derived reverse order vs grid)
4. **Test suite:** Add `npm run audit:collisions` to CI; extend word-risk list; rename v2 collision test.
5. **Do not yet:** invent new symbols or remove mappings without explicit design approval.

## 8. Issue classification

| issue | class | needs human decision? |
| --- | --- | --- |
| Recovered keys looked like English (boy) | code bug / display | no — fixed |
| o+r symbol sequence equals oy | language-design collision | yes |
| Vowel+glide sequences equal diphthongs (eye/ow/oy/ay) | language-design collision | yes — homograph note exists |
| th+t equals t+s symbol strings | language-design collision | yes |
| Unspaced greedy decode mis-recovery | decoder + boundary issue | partially mitigated by spacing |
| v2 test "0 collisions" wording | test/documentation bug | no — rename/clarify |
