# Language Rules

## Places of Articulation

| id            | symbol | key_number | key_letter | label         | sound | explanation                                         |
| ------------- | ------ | ---------: | ---------- | ------------- | ----- | --------------------------------------------------- |
| lips          | ○      |          1 | p          | Lips          | p     | Lips/front-most articulation                        |
| front_tongue  | ∩      |          2 | t          | Front Tongue  | t     | Front tongue/alveolar or dental articulation        |
| middle_tongue | ⌒      |          3 | c          | Middle Tongue | c     | Middle tongue/palatal or post-alveolar articulation |
| back_tongue   | ∪      |          4 | k          | Back Tongue   | k     | Back tongue/velar articulation                      |
| throat        | ⊐      |          5 | h          | Throat        | ?     | Throat/glottal articulation                         |

## Modifiers

| id       | symbol | key_number | key_letter | label          | explanation                     |
| -------- | ------ | ---------: | ---------- | -------------- | ------------------------------- |
| voice    | ⌔      |          6 | b          | Voice          | Adds voicing to a place sound   |
| friction | ⌕      |          7 | d          | Friction       | Adds friction/fricative quality |
| nasal    | ⌙      |          8 | j          | Nasal          | Adds nasal airflow              |
| glide    | ⌓      |          9 | g          | Glide / Liquid | Creates glide or liquid sounds  |

## Sound Grid

| modifier_id | place_id      | symbols | sound | ipa         | status    | explanation                                    |
| ----------- | ------------- | ------- | ----- | ----------- | --------- | ---------------------------------------------- |
| plain       | lips          | ○       | p     | /p/         | defined   | Plain lips stop                                |
| plain       | front_tongue  | ∩       | t     | /t/         | defined   | Plain front tongue stop                        |
| plain       | middle_tongue | ⌒       | c     | /tʃ/ or /c/ | defined   | Plain middle tongue stop/affricate placeholder |
| plain       | back_tongue   | ∪       | k     | /k/         | defined   | Plain back tongue stop                         |
| plain       | throat        | ⊐       | ?     | ?           | undefined | Open research gap                              |
| voice       | lips          | ⌔○      | b     | /b/         | defined   | Voiced lips sound                              |
| voice       | front_tongue  | ⌔∩      | d     | /d/         | defined   | Voiced front tongue sound                      |
| voice       | middle_tongue | ⌔⌒      | j     | /dʒ/        | defined   | Voiced middle tongue sound                     |
| voice       | back_tongue   | ⌔∪      | g     | /g/         | defined   | Voiced back tongue sound                       |
| voice       | throat        | ⌔⊐      | ?     | ?           | undefined | Open research gap                              |
| friction    | lips          | ⌕○      | f     | /f/         | defined   | Friction lips sound                            |
| friction    | front_tongue  | ⌕∩      | s     | /s/         | defined   | Friction front tongue sound                    |
| friction    | middle_tongue | ⌕⌒      | sh    | /ʃ/         | defined   | Friction middle tongue sound                   |
| friction    | back_tongue   | ⌕∪      | x     | /x/         | defined   | Friction back tongue sound                     |
| friction    | throat        | ⌕⊐      | h     | /h/         | defined   | Friction throat sound                          |
| nasal       | lips          | ⌙○      | m     | /m/         | defined   | Nasal lips sound                               |
| nasal       | front_tongue  | ⌙∩      | n     | /n/         | defined   | Nasal front tongue sound                       |
| nasal       | middle_tongue | ⌙⌒      | ñ     | /ɲ/         | defined   | Nasal middle tongue sound                      |
| nasal       | back_tongue   | ⌙∪      | ng    | /ŋ/         | defined   | Nasal back tongue sound                        |
| nasal       | throat        | ⌙⊐      | ?     | ?           | undefined | Open research gap                              |
| glide       | lips          | ⌓○      | w     | /w/         | defined   | Glide lips sound                               |
| glide       | front_tongue  | ⌓∩      | y     | /j/         | defined   | Glide front tongue sound                       |
| glide       | middle_tongue | ⌓⌒      | r     | /r/         | defined   | Glide middle tongue sound                      |
| glide       | back_tongue   | ⌓∪      | l     | /l/         | defined   | Glide back tongue sound                        |
| glide       | throat        | ⌓⊐      | ?     | ?           | undefined | Open research gap                              |

## Special Derived Sounds

Some sounds are created by reversing an existing modifier-place order. These are defined individually and should not be generalized unless explicitly added to the rules.

| symbols | sound | ipa | status  | explanation                              |
| ------- | ----- | --- | ------- | ---------------------------------------- |
| ∩⌕      | th    | /θ/ | defined | Voiceless dental fricative, as in "thin" |
| ∩⌔      | dh    | /ð/ | defined | Voiced dental fricative, as in "this"    |

## Notes

* Undefined cells are not errors.
* Undefined cells are intentional research gaps.
* Do not invent extra symbols.
* Do not automatically add spaces between symbols.
* Symbol combinations should render tightly, for example `⌔○`, not `⌔ ○`.
* The app should normalize accidental spaces between known symbols when decoding.
* The throat symbol has no standalone consonant value during this testing phase. Its primary role is currently vowel construction.

## Experimental Vowel System

This section is experimental and should not be considered finalized.

### Design Goal

The current testing phase prioritizes readability and visual chunking over phonetic precision.

All vowel representations should remain two symbols long.

The purpose of this experiment is to determine whether readers can quickly recognize vowel patterns within words and sentences.

### Concept

Vowels are represented using the throat symbol followed by a place of articulation symbol.

This preserves the core design goal of expressing all phonemes using the existing 9 symbols.

Vowels are treated as standalone phonemes and are not modifiers.

### Experimental Vowel Mapping

| symbols | vowel | ipa | notes                      |
| ------- | ----- | --- | -------------------------- |
| ⊐⊐      | a     | /a/ | open throat-centered vowel |
| ⊐∩      | e     | /e/ | front vowel                |
| ⊐⌒      | i     | /i/ | high/front vowel           |
| ⊐∪      | o     | /o/ | back vowel                 |
| ⊐○      | u     | /u/ | rounded lips vowel         |

### Long Vowels

Long vowels are not currently distinguished.

During this testing phase, long and short vowel variants map to the same vowel symbols.

Examples:

| sound | symbols |
| ----- | ------- |
| a / ā | ⊐⊐      |
| e / ē | ⊐∩      |
| i / ī | ⊐⌒      |
| o / ō | ⊐∪      |
| u / ū | ⊐○      |

Examples:

| word | spelling |
| ---- | -------- |
| pa   | ○⊐⊐      |
| pe   | ○⊐∩      |
| pi   | ○⊐⌒      |
| po   | ○⊐∪      |
| pu   | ○⊐○      |
| pay  | ○⊐⊐      |
| pee  | ○⊐∩      |
| pie  | ○⊐⌒      |
| poe  | ○⊐∪      |
| pew  | ○⊐○      |

### Notes

* This mapping is provisional.
* The purpose is to evaluate readability, learnability, and visual intuitiveness.
* Long vowels are intentionally collapsed into the same representations as short vowels.
* Future revisions may introduce dedicated long-vowel forms if readability remains acceptable.
* Existing consonant definitions remain unchanged.

## Experimental Derived Sounds

This section is experimental and should not be considered finalized.

### Candidate Sounds

| symbols | sound | ipa | status       | explanation                                                       |
| ------- | ----- | --- | ------------ | ----------------------------------------------------------------- |
| ○⌔      | v     | /v/ | experimental | Voiced labial fricative derived from reversed lips-voice ordering |

### Notes

* Experimental derived sounds are evaluated individually.
* Reversed symbol order does not automatically imply a rule.
* Each derived sound must be explicitly defined.
* Future revisions may remove or replace experimental sounds.

