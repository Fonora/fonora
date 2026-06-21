# Language Rules (V1 snapshot for comparison tests)

## Configuration

| key | value |
| --- | ----- |
| fonora_version | v1 |
| ipa_vowel_mode | default |

## Places of Articulation

| id | symbol | key_number | key_letter | label | sound | explanation |
| --- | --- | ---: | --- | --- | --- | --- |
| lips | ○ | 1 | p | Lips | p | Lips/front-most articulation |
| front_tongue | ∩ | 2 | t | Front Tongue | t | Front tongue/alveolar or dental articulation |
| middle_tongue | ⌒ | 3 | c | Middle Tongue | c | Middle tongue/palatal or post-alveolar articulation |
| back_tongue | ∪ | 4 | k | Back Tongue | k | Back tongue/velar articulation |
| throat | ⊐ | 5 | h | Throat | ? | Throat/glottal articulation |

## Modifiers

| id | symbol | key_number | key_letter | label | explanation |
| --- | --- | ---: | --- | --- | --- |
| voice | ⌔ | 6 | b | Voice | Adds voicing to a place sound |
| friction | ⌕ | 7 | d | Friction | Adds friction/fricative quality |
| nasal | ⌙ | 8 | j | Nasal | Adds nasal airflow |
| glide | ⌓ | 9 | g | Glide / Liquid | Creates glide or liquid sounds |

## Sound Grid

| modifier_id | place_id | sound | ipa | status | explanation |
| --- | --- | --- | --- | --- | --- |
| plain | lips | p | /p/ | defined | Plain lips stop |
| plain | front_tongue | t | /t/ | defined | Plain front tongue stop |
| plain | middle_tongue | c | /tʃ/ or /c/ | defined | Plain middle tongue stop |
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

| vowel | plane | component | ipa |
| --- | --- | --- | --- |
| a | primary | throat | a, ɑ, æ, ɐ, ʌ, ɑː |
| e | primary | front_tongue | e, ɛ, ə, ɜ, ɜː |
| i | primary | middle_tongue | i, ɪ, y, ɨ, iː, yː |
| o | primary | back_tongue | o, ɔ, ɒ, ø, œ, oː, ɔː |
| u | primary | lips | u, ʊ, ʉ, ɯ, uː |

## IPA Supplemental Mappings

| ipa | fonora_phoneme |
| --- | --- |
| ɚ | e, r |
| aɪ | a, i |
| aʊ | a, u |
| eɪ | e, i |
| oʊ | o, u |
| əʊ | o, u |
| ɔɪ | o, i |
| ɪə | i, e |
| eə | e, e |
| ʊə | u, e |

## Special Derived Sounds

| sound | composition | ipa | status | explanation |
| --- | --- | --- | --- | --- |
| th | reverse_front_tongue_friction | /θ/ | defined | Voiceless dental fricative |
| dh | reverse_front_tongue_voice | /ð/ | defined | Voiced dental fricative |

## Experimental Derived Sounds

### Candidate Sounds

| sound | composition | ipa | status | explanation |
| --- | --- | --- | --- | --- |
| v | reverse_lips_voice | /v/ | experimental | Reversed lips+voice ordering |
