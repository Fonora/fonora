# Fonoran primitive roots — generation report

> **Archive — auto-generated report (2026-06-27).** Primary source for [RN-10 · Optimal sounds, wrong premise](/research/notes/huffman-roots). Superseded by the editorial pipeline in [fonoran.md](fonoran.md); not committed as canonical vocabulary.

>
> **Archive — superseded direction.** This ~200-primitive algorithmic run predates the
> [Fonoran Constitution](fonoran-constitution.md), which reorients the language around a small,
> human-experience root set (the tiered model: ~50 communicative core → ~100 extended →
> unlimited) gated by the campfire test. Kept for reference, not as the production inventory.

Algorithmic assignment of ~200 semantic primitives to phonetically ranked syllables, following [fonoran-grammar.md](fonoran-grammar.md).

## Summary

| Metric | Value |
| --- | --- |
| Concepts assigned | 200 |
| **Total vocabulary** | **281** (200 primitives + 81 compounds) |
| Unresolved compounds | 0 |
| Syllable pool size | 407 |
| Reserved particles | mi, ta, na |
| Excluded syllables | pi, pee, po, poo |
| Shortest root | ba (person) |
| Longest root | dabe |

## Prior generator evaluation

| Generation | Approach | Adaptable? |
| --- | --- | --- |
| Gen 1 | Hand roots + grammar vowels (a/e/i/o/u inflection) | **No** — violates invariant-word grammar |
| Gen 2 | Coordinate → grid + IE collision repair | **No** — concept-first, not grid-native |
| Gen 3 / 3.1 | 36 DDA primitives → phonetic spread | **Partially** — reused `distinctivenessPenalty` scoring |
| **This run** | 200 ranked human primitives → Huffman-like syllable allocation | **New** — `tools/fonoran-primitive-roots.js` |

## Scoring methodology

Concepts are sorted by **fundamentality priority** (1000 = most foundational). Each concept receives a **target phonetic cost** linearly mapped from priority — a Huffman-like principle where frequent/fundamental concepts should have the lowest phonetic cost.

For each concept, the generator evaluates every available syllable in the pool:

1. **Phonetic cost mismatch** — `|syllable_cost − target_cost| × 12`
2. **Distinctiveness** — adapted from Gen 3.1 (`fonoran-gen3-distinctiveness.js`): duplicate roots, prefix overlaps, rhyme clustering, onset similarity
3. **Particle flow**: penalizes roots that echo particles in `mi ___`, `mi ta ___`, `mi na ___`
4. **Compound flow** — penalizes awkward concatenations with recently assigned roots
5. **Distribution caps** — soft limits on rhyme class and onset reuse
6. **Tier gates** — top-priority concepts blocked from CVC/CV-CV; relaxed for lower deciles

### Syllable pool tiers (lowest cost first)

1. Preferred onsets (`b d f g k l m n s t`) + vowel `a`
2. Same onsets + other vowels (`e i o u`)
3. Secondary onsets (`h w y`)
4. Tertiary onsets (`p ch sh j r`) — `p` only with safe vowels; `pi`/`po` excluded
5. CVC extensions
6. Disyllabic CV-CV for lowest-priority concepts

## Priority ↔ phonetic cost correlation

| Decile | Priority range | Avg cost | Avg length | Samples |
| --- | --- | ---: | ---: | --- |
| 1 | 981–1000 | 9.7 | 2 | ba (person), de (self), fi (do) |
| 2 | 961–980 | 25.9 | 2.3 | che (move), shu (speak), no (give) |
| 3 | 941–960 | 43.7 | 2.7 | pe (some), nu (other), ja (same) |
| 4 | 921–940 | 55.4 | 3 | bem (small), dat (good), fas (bad) |
| 5 | 901–920 | 56.3 | 3 | kes (hold), nel (use), sak (need) |
| 6 | 881–900 | 56.4 | 3 | sas (pulse), nam (cycle), sen (signal) |
| 7 | 861–880 | 63 | 3.3 | tek (understand), mas (learn), fal (teach) |
| 8 | 841–860 | 59.1 | 3.2 | kage (wave), tat (weave), nas (lattice) |
| 9 | 821–840 | 62.9 | 3.3 | li (how), gabe (if), do (because) |
| 10 | 801–820 | 68 | 3.4 | nafe (voice), lu (sound), lel (touch) |

## Template distribution

- **CVC**: 101
- **CV**: 62
- **CV-CV**: 37

## Sample compound probes

| Concepts | Compound |
| --- | --- |
| person + collective | **balo** |
| water + fire | **wagu** |
| love + person | **yaba** |
| inside + container | **wesan** |
| speak + signal | **shusen** |
| move + path | **chenan** |
| light + dark | **mopa** |
| give + take | **noti** |
| life + death | **sishe** |
| know + unknown | **mesek** |

## Tradeoffs and heuristics

- **Fundamentality scores are author-curated**, not corpus-derived. A future pass could seed priorities from semantic dependency graphs or Swadesh-style lists.
- **Grammar doc examples** (`ka`, `sha`, `kaso`, `fa`) are illustrative placeholders; this run does not preserve them — compare output before any canonical merge.
- **Particle reservation** is conservative (`mi`, `la`, `ta`, `na`). Future particles (negation, future tense) may require re-reservation.
- **`p` onset** is deprioritized and `pi`/`po` blocked; this shrinks the pool but avoids English bathroom humor.
- **CVC and disyllabic forms** absorb lowest-priority concepts when CV inventory exhausts — expect longer forms below priority ~850.
- **Compound flow** uses local pairwise checks only; full-tree pronounceability needs human review.
- **Excluded composites** (tribe, family, language, …) are not primitive roots — they appear as **transparent compounds** in the vocabulary layer.

## Vocabulary (English → Fonoran)

Each primitive is a standalone word. Complex English concepts are **compound words** built by concatenating primitive roots (semantic tree visible in spelling).

### Grammar examples

| English | Fonoran | Composition |
| --- | --- | --- |
| tribe | **loba** | collective + person |
| war | **lobawi** | collective + person + conflict |
| family | **lofakba** | collective + bond + person |
| language | **senfakdaga** | signal + bond + group |
| river | **neknan** | flow + path |
| memory | **tetsankel** | mark + container + static |
| community | **dagafaknem** | group + bond + identity |

### Full vocabulary

| English | Fonoran | Kind | Composition |
| --- | --- | --- | --- |
| above | **sage** | primitive | — |
| after | **to** | primitive | — |
| again | **mafe** | primitive | — |
| against | **nal** | primitive | — |
| agent | **ju** | primitive | — |
| air | **mam** | primitive | — |
| all | **yi** | primitive | — |
| always | **gaya** | primitive | — |
| anger | **dak** | primitive | — |
| animal | **tak** | primitive | — |
| answer | **gek** | primitive | — |
| art | **bettetgem** | compound | form + mark + will |
| ask | **mal** | primitive | — |
| back | **yu** | primitive | — |
| bad | **fas** | primitive | — |
| beauty | **betsastel** | compound | form + pulse + field |
| because | **do** | primitive | — |
| before | **hi** | primitive | — |
| beginning | **gatkakmabe** | compound | source + threshold + motion |
| believe | **kam** | primitive | — |
| below | **safa** | primitive | — |
| between | **ken** | primitive | — |
| big | **ten** | primitive | — |
| birth | **gattalkak** | compound | source + change + threshold |
| blood | **wu** | primitive | — |
| body | **mu** | primitive | — |
| bond | **fak** | primitive | — |
| bone | **nawa** | primitive | — |
| book | **santettat** | compound | container + mark + weave |
| bound | **sem** | primitive | — |
| breath | **gel** | primitive | — |
| bridge | **faknankak** | compound | bond + path + threshold |
| call | **dan** | primitive | — |
| calm | **nat** | primitive | — |
| can | **gan** | primitive | — |
| cause | **mat** | primitive | — |
| center | **fade** | primitive | — |
| change | **tal** | primitive | — |
| child | **jugatmabe** | compound | agent + source + motion |
| city | **dagabetsem** | compound | group + form + bound |
| close | **nage** | primitive | — |
| cold | **ses** | primitive | — |
| collective | **lo** | primitive | — |
| color | **naba** | primitive | — |
| come | **du** | primitive | — |
| community | **dagafaknem** | compound | group + bond + identity |
| conflict | **wi** | primitive | — |
| container | **san** | primitive | — |
| craft | **tatbetju** | compound | weave + form + agent |
| cycle | **nam** | primitive | — |
| dance | **mabesastat** | compound | motion + pulse + weave |
| dark | **pa** | primitive | — |
| day | **maga** | primitive | — |
| death | **she** | primitive | — |
| do | **fi** | primitive | — |
| door | **kaksan** | compound | threshold + container |
| down | **sam** | primitive | — |
| dream | **gafekagegem** | compound | void + wave + will |
| drink | **kem** | primitive | — |
| dry | **tabe** | primitive | — |
| earth | **ye** | primitive | — |
| eat | **kan** | primitive | — |
| edge | **dafa** | primitive | — |
| effect | **nak** | primitive | — |
| empty | **bak** | primitive | — |
| end | **semkelnam** | compound | bound + static + cycle |
| enemy | **semmantal** | compound | bound + far + change |
| envelope | **gal** | primitive | — |
| eye | **dam** | primitive | — |
| false | **gak** | primitive | — |
| family | **lofakba** | compound | collective + bond + person |
| far | **man** | primitive | — |
| fast | **ru** | primitive | — |
| fear | **bu** | primitive | — |
| feel | **gi** | primitive | — |
| few | **wo** | primitive | — |
| field | **tel** | primitive | — |
| fire | **gu** | primitive | — |
| first | **dem** | primitive | — |
| flow | **nek** | primitive | — |
| food | **tamgatsan** | compound | material + source + container |
| foot | **faya** | primitive | — |
| for | **tas** | primitive | — |
| forest | **dagatattel** | compound | group + weave + field |
| forget | **fes** | primitive | — |
| form | **bet** | primitive | — |
| friend | **fakjukek** | compound | bond + agent + near |
| front | **kada** | primitive | — |
| full | **las** | primitive | — |
| game | **faksemmabe** | compound | bond + bound + motion |
| gift | **gatmabefak** | compound | source + motion + bond |
| give | **no** | primitive | — |
| go | **ha** | primitive | — |
| god | **gattelgem** | compound | source + field + will |
| good | **dat** | primitive | — |
| government | **lojusem** | compound | collective + agent + bound |
| grief | **nen** | primitive | — |
| group | **daga** | primitive | — |
| grow | **fan** | primitive | — |
| hand | **ben** | primitive | — |
| hard | **kawa** | primitive | — |
| have | **ku** | primitive | — |
| head | **fek** | primitive | — |
| hear | **ko** | primitive | — |
| heart | **gas** | primitive | — |
| here | **chu** | primitive | — |
| hold | **kes** | primitive | — |
| home | **sanchufak** | compound | container + here + bond |
| hope | **ges** | primitive | — |
| hot | **sal** | primitive | — |
| house | **sanbetgal** | compound | container + form + envelope |
| how | **li** | primitive | — |
| idea | **tetgatsen** | compound | mark + source + signal |
| identity | **nem** | primitive | — |
| if | **gabe** | primitive | — |
| inside | **we** | primitive | — |
| joy | **ket** | primitive | — |
| know | **me** | primitive | — |
| knowledge | **satsannas** | compound | known + container + lattice |
| known | **sat** | primitive | — |
| lake | **sankeldabe** | compound | container + static + surface |
| language | **senfakdaga** | compound | signal + bond + group |
| last | **bal** | primitive | — |
| lattice | **nas** | primitive | — |
| law | **semtetkel** | compound | bound + mark + static |
| learn | **mas** | primitive | — |
| left | **hu** | primitive | — |
| less | **sade** | primitive | — |
| lie | **sengafetal** | compound | signal + void + change |
| life | **si** | primitive | — |
| light | **mo** | primitive | — |
| long | **bek** | primitive | — |
| love | **ya** | primitive | — |
| machine | **betsasfak** | compound | form + pulse + bond |
| make | **fo** | primitive | — |
| many | **le** | primitive | — |
| mark | **tet** | primitive | — |
| material | **tam** | primitive | — |
| memory | **tetsankel** | compound | mark + container + static |
| metal | **dage** | primitive | — |
| mind | **sangemnas** | compound | container + will + lattice |
| money | **tetfaktam** | compound | mark + bond + material |
| moon | **namtelkek** | compound | cycle + field + near |
| more | **mada** | primitive | — |
| motion | **mabe** | primitive | — |
| mountain | **semtelkel** | compound | bound + field + static |
| mouth | **fat** | primitive | — |
| move | **che** | primitive | — |
| music | **kagesasfak** | compound | wave + pulse + bond |
| name | **bes** | primitive | — |
| nation | **losemset** | compound | collective + bound + place |
| near | **kek** | primitive | — |
| need | **sak** | primitive | — |
| never | **fu** | primitive | — |
| new | **di** | primitive | — |
| night | **bo** | primitive | — |
| no | **kal** | primitive | — |
| now | **ho** | primitive | — |
| number | **lam** | primitive | — |
| ocean | **nektelgal** | compound | flow + field + envelope |
| old | **pu** | primitive | — |
| one | **ki** | primitive | — |
| open | **tafa** | primitive | — |
| other | **nu** | primitive | — |
| outside | **cha** | primitive | — |
| pain | **tan** | primitive | — |
| parent | **gatfakju** | compound | source + bond + agent |
| part | **tes** | primitive | — |
| path | **nan** | primitive | — |
| pattern | **let** | primitive | — |
| peace | **kelfaktel** | compound | static + bond + field |
| person | **ba** | primitive | — |
| place | **set** | primitive | — |
| planet | **semtelmabe** | compound | bound + field + motion |
| plant | **kas** | primitive | — |
| play | **mabesasdaga** | compound | motion + pulse + group |
| power | **gatfabatel** | compound | source + reach + field |
| probe | **gada** | primitive | — |
| pulse | **sas** | primitive | — |
| question | **gadasek** | compound | probe + unknown |
| rain | **neksasfaba** | compound | flow + pulse + reach |
| reach | **faba** | primitive | — |
| religion | **fakgatlo** | compound | bond + source + collective |
| remember | **bel** | primitive | — |
| right | **nade** | primitive | — |
| river | **neknan** | compound | flow + path |
| road | **nandabemabe** | compound | path + surface + motion |
| same | **ja** | primitive | — |
| say | **la** | primitive | — |
| secret | **sansekgal** | compound | container + unknown + envelope |
| see | **ni** | primitive | — |
| seed | **fem** | primitive | — |
| self | **de** | primitive | — |
| sentence | **faktetnan** | compound | bond + mark + path |
| shadow | **gafesemdabe** | compound | void + bound + surface |
| shape | **dek** | primitive | — |
| ship | **sanneknan** | compound | container + flow + path |
| short | **das** | primitive | — |
| signal | **sen** | primitive | — |
| skill | **betmabenas** | compound | form + motion + lattice |
| skin | **sabe** | primitive | — |
| sky | **telfabagafe** | compound | field + reach + void |
| sleep | **mak** | primitive | — |
| slow | **kaba** | primitive | — |
| small | **bem** | primitive | — |
| smell | **mes** | primitive | — |
| snow | **kelnekdabe** | compound | static + flow + surface |
| some | **pe** | primitive | — |
| soul | **gatnemgel** | compound | source + identity + breath |
| sound | **lu** | primitive | — |
| source | **gat** | primitive | — |
| space | **telgafefaba** | compound | field + void + reach |
| speak | **shu** | primitive | — |
| speaker | **senju** | compound | signal + agent |
| speech | **sengelju** | compound | signal + breath + agent |
| spirit | **gelkagegafe** | compound | breath + wave + void |
| star | **gatsasman** | compound | source + pulse + far |
| start | **kat** | primitive | — |
| static | **kel** | primitive | — |
| stay | **fam** | primitive | — |
| stone | **gen** | primitive | — |
| stop | **fen** | primitive | — |
| storm | **kagetaltel** | compound | wave + change + field |
| story | **tetnantal** | compound | mark + path + change |
| strong | **yo** | primitive | — |
| substance | **dal** | primitive | — |
| sun | **gatfabasas** | compound | source + reach + pulse |
| surface | **dabe** | primitive | — |
| take | **ti** | primitive | — |
| taste | **tade** | primitive | — |
| teach | **fal** | primitive | — |
| that | **re** | primitive | — |
| there | **sha** | primitive | — |
| thing | **go** | primitive | — |
| think | **ra** | primitive | — |
| this | **tu** | primitive | — |
| thought | **gadanastal** | compound | probe + lattice + change |
| three | **gaha** | primitive | — |
| threshold | **kak** | primitive | — |
| time | **tem** | primitive | — |
| tool | **betgada** | compound | form + probe |
| touch | **lel** | primitive | — |
| trade | **fakmabetal** | compound | bond + motion + change |
| tree | **betgatkel** | compound | form + source + static |
| tribe | **loba** | compound | collective + person |
| true | **fel** | primitive | — |
| truth | **satfakgat** | compound | known + bond + source |
| two | **men** | primitive | — |
| understand | **tek** | primitive | — |
| universe | **telgafegat** | compound | field + void + source |
| unknown | **sek** | primitive | — |
| up | **nes** | primitive | — |
| use | **nel** | primitive | — |
| vehicle | **sanmabenan** | compound | container + motion + path |
| voice | **nafe** | primitive | — |
| void | **gafe** | primitive | — |
| wake | **net** | primitive | — |
| wall | **semkeltam** | compound | bound + static + material |
| want | **so** | primitive | — |
| war | **lobawi** | compound | collective + person + conflict |
| water | **wa** | primitive | — |
| wave | **kage** | primitive | — |
| weak | **fage** | primitive | — |
| weave | **tat** | primitive | — |
| wet | **len** | primitive | — |
| what | **bi** | primitive | — |
| when | **kafe** | primitive | — |
| where | **faha** | primitive | — |
| who | **sawa** | primitive | — |
| whole | **sel** | primitive | — |
| why | **su** | primitive | — |
| will | **gem** | primitive | — |
| wind | **nekgelfaba** | compound | flow + breath + reach |
| wisdom | **gatkelnan** | compound | source + static + path |
| with | **fet** | primitive | — |
| without | **gam** | primitive | — |
| wood | **daha** | primitive | — |
| word | **sentet** | compound | signal + mark |
| work | **jutalbet** | compound | agent + change + form |
| world | **telsembet** | compound | field + bound + form |
| yes | **get** | primitive | — |

## Primitive roots (ranked)

| Rank | Root | Concept | Gloss | Priority | Cost |
| ---: | --- | --- | --- | ---: | ---: |
| 1 | **ba** | person | a human being; someone | 1000 | 1 |
| 2 | **de** | self | oneself; the same locus as speaker | 999 | 3 |
| 3 | **fi** | do | perform; carry out an action | 998 | 5 |
| 4 | **go** | thing | entity; something that exists | 997 | 7 |
| 5 | **ku** | have | possess; hold relation to | 996 | 9 |
| 6 | **la** | say | utter words; express verbally | 995 | 6 |
| 7 | **me** | know | have certainty about; understand | 994 | 8 |
| 8 | **ni** | see | perceive with eyes; visually apprehend | 993 | 10 |
| 9 | **so** | want | desire; wish for | 992 | 12 |
| 10 | **tu** | this | the nearby demonstrative | 991 | 14 |
| 11 | **ha** | go | move away from locus; depart | 990 | 20 |
| 12 | **du** | come | move toward locus; arrive | 989 | 6 |
| 13 | **fo** | make | create; bring into being | 988 | 6 |
| 14 | **ki** | one | single unit; not many | 987 | 7 |
| 15 | **le** | many | plural quantity; more than few | 986 | 7 |
| 16 | **wa** | water | liquid H₂O; flowing substance | 985 | 21 |
| 17 | **gu** | fire | combustion; heat and light emission | 984 | 8 |
| 18 | **ye** | earth | ground; solid terrestrial matter | 983 | 23 |
| 19 | **mo** | light | visible illumination; not dark | 982 | 10 |
| 20 | **si** | life | living state; not dead | 981 | 11 |
| 21 | **che** | move | change position; be in motion | 980 | 36 |
| 22 | **shu** | speak | produce speech; talk | 979 | 37 |
| 23 | **no** | give | transfer to another; offer | 978 | 11 |
| 24 | **ti** | take | receive from another; grasp | 977 | 12 |
| 25 | **ya** | love | deep affection; bond of care | 976 | 22 |
| 26 | **bu** | fear | apprehension of harm; dread | 975 | 5 |
| 27 | **we** | inside | within interior; not outside | 974 | 22 |
| 28 | **cha** | outside | beyond boundary; exterior | 973 | 36 |
| 29 | **hi** | before | earlier in time; prior | 972 | 22 |
| 30 | **to** | after | later in time; following | 971 | 13 |
| 31 | **she** | death | end of life; not alive | 970 | 37 |
| 32 | **pa** | dark | absence of light; dim | 969 | 35 |
| 33 | **ju** | agent | activated locus; one who acts | 968 | 38 |
| 34 | **lo** | collective | many-as-one; group without specifying kind | 967 | 9 |
| 35 | **wi** | conflict | opposition; clash between parties | 966 | 23 |
| 36 | **re** | that | the distal demonstrative | 965 | 39 |
| 37 | **chu** | here | at this place; indexical locus | 964 | 36 |
| 38 | **sha** | there | at that place; distal locus | 963 | 37 |
| 39 | **ho** | now | at the present moment | 962 | 23 |
| 40 | **yi** | all | every one; totality | 961 | 24 |
| 41 | **pe** | some | an indefinite portion; not all | 960 | 35 |
| 42 | **nu** | other | different one; not same | 959 | 12 |
| 43 | **ja** | same | identical; not different | 958 | 38 |
| 44 | **ko** | hear | perceive with ears; auditory sense | 957 | 8 |
| 45 | **gi** | feel | sense by touch or emotion | 956 | 6 |
| 46 | **ra** | think | use mind; reason mentally | 955 | 39 |
| 47 | **mu** | body | physical form of a being | 954 | 11 |
| 48 | **ben** | hand | grasping limb; manual extremity | 953 | 50.6 |
| 49 | **dam** | eye | organ of sight | 952 | 51.3 |
| 50 | **fat** | mouth | oral opening; speech organ | 951 | 52.6 |
| 51 | **fek** | head | upper body part; seat of mind | 950 | 53.3 |
| 52 | **gas** | heart | central organ; seat of emotion | 949 | 54 |
| 53 | **gel** | breath | air stream of life; respiration | 948 | 54.7 |
| 54 | **kan** | eat | consume food | 947 | 54.8 |
| 55 | **kem** | drink | consume liquid | 946 | 55.5 |
| 56 | **mak** | sleep | rest in unconsciousness | 945 | 57.5 |
| 57 | **net** | wake | cease sleeping; become alert | 944 | 59.2 |
| 58 | **sal** | hot | high temperature; not cold | 943 | 60.1 |
| 59 | **ses** | cold | low temperature; not hot | 942 | 60.6 |
| 60 | **ten** | big | large size; not small | 941 | 61.4 |
| 61 | **bem** | small | little size; not big | 940 | 50.7 |
| 62 | **dat** | good | positive value; desirable | 939 | 51.4 |
| 63 | **fas** | bad | negative value; undesirable | 938 | 52.8 |
| 64 | **fel** | true | corresponds to reality; not false | 937 | 53.5 |
| 65 | **gak** | false | does not correspond; not true | 936 | 53.9 |
| 66 | **get** | yes | affirmation; agreement | 935 | 54.4 |
| 67 | **kal** | no | negation; denial | 934 | 55.3 |
| 68 | **kek** | near | close in space; proximal | 933 | 55.7 |
| 69 | **man** | far | distant in space; remote | 932 | 57.2 |
| 70 | **nes** | up | higher position; above | 931 | 59.4 |
| 71 | **sam** | down | lower position; below | 930 | 59.7 |
| 72 | **nan** | path | directed passage through space | 929 | 58.4 |
| 73 | **set** | place | location; spatial locus | 928 | 60.4 |
| 74 | **tem** | time | duration; temporal dimension | 927 | 61.5 |
| 75 | **bek** | long | extended duration or length | 926 | 50.9 |
| 76 | **das** | short | brief duration or length | 925 | 51.6 |
| 77 | **tal** | change | become different; transform | 924 | 61.3 |
| 78 | **fam** | stay | remain; not leave | 923 | 52.5 |
| 79 | **fen** | stop | cease motion or action | 922 | 53 |
| 80 | **kat** | start | begin; initiate action | 921 | 55 |
| 81 | **kes** | hold | grasp and keep; retain physically | 920 | 55.8 |
| 82 | **nel** | use | employ for purpose; apply | 919 | 59.5 |
| 83 | **sak** | need | require; lack necessitating fulfillment | 918 | 59.9 |
| 84 | **gan** | can | ability; power to do | 917 | 53.6 |
| 85 | **gem** | will | intention; future-directed intent | 916 | 54.3 |
| 86 | **mat** | cause | what brings about an effect | 915 | 57.4 |
| 87 | **nak** | effect | what follows from a cause | 914 | 58.7 |
| 88 | **tes** | part | component of a whole | 913 | 61.8 |
| 89 | **sel** | whole | complete entirety; all parts together | 912 | 60.7 |
| 90 | **bet** | form | articulated shape; composed figure | 911 | 50.8 |
| 91 | **dal** | substance | material stuff; physical matter | 910 | 51.7 |
| 92 | **mam** | air | atmosphere; breathable gas | 909 | 57.3 |
| 93 | **gen** | stone | hard mineral matter; rock | 908 | 54.2 |
| 94 | **kas** | plant | living vegetation; flora | 907 | 55.2 |
| 95 | **tak** | animal | living creature; fauna | 906 | 61.1 |
| 96 | **fan** | grow | increase in size; develop | 905 | 52.4 |
| 97 | **fem** | seed | origin of new life; generative kernel | 904 | 53.1 |
| 98 | **gat** | source | generative point; where something begins | 903 | 53.8 |
| 99 | **nek** | flow | continuous change; unbounded passage | 902 | 59.3 |
| 100 | **kel** | static | without change; stable state | 901 | 55.9 |
| 101 | **sas** | pulse | rhythmic activation; repeating beat | 900 | 60 |
| 102 | **nam** | cycle | return path; repeating sequence | 899 | 58.5 |
| 103 | **sen** | signal | discrete emission; communicative packet | 898 | 60.2 |
| 104 | **tet** | mark | intentional sign; deliberate trace | 897 | 61.6 |
| 105 | **bes** | name | identifier for an entity | 896 | 51 |
| 106 | **mal** | ask | request information; pose question | 895 | 57.7 |
| 107 | **gek** | answer | respond to question; reply | 894 | 54.5 |
| 108 | **dan** | call | summon by voice; invoke | 893 | 51.2 |
| 109 | **fak** | bond | connection; what holds together | 892 | 52.7 |
| 110 | **fet** | with | accompaniment; togetherness | 891 | 53.2 |
| 111 | **gam** | without | absence of accompaniment | 890 | 53.7 |
| 112 | **tas** | for | benefit or purpose directed toward | 889 | 61.2 |
| 113 | **nal** | against | opposition directed toward | 888 | 58.9 |
| 114 | **ken** | between | intermediate position of two | 887 | 55.4 |
| 115 | **nem** | identity | self-same across time; sameness of entity | 886 | 59.1 |
| 116 | **sat** | known | established certainty; indexed truth | 885 | 59.8 |
| 117 | **sek** | unknown | not established; opaque | 884 | 60.5 |
| 118 | **bel** | remember | retain in mind; recall past | 883 | 51.1 |
| 119 | **fes** | forget | lose from mind; fail to recall | 882 | 53.4 |
| 120 | **kam** | believe | hold as true without proof | 881 | 54.9 |
| 121 | **tek** | understand | grasp meaning; comprehend | 880 | 61.7 |
| 122 | **mas** | learn | acquire knowledge or skill | 879 | 57.6 |
| 123 | **fal** | teach | impart knowledge or skill | 878 | 52.9 |
| 124 | **ket** | joy | happiness; positive emotion | 877 | 55.6 |
| 125 | **tan** | pain | physical or emotional suffering | 876 | 60.8 |
| 126 | **dak** | anger | strong displeasure; rage | 875 | 51.5 |
| 127 | **ges** | hope | expectation of good; optimism | 874 | 54.6 |
| 128 | **nen** | grief | deep sorrow; mourning | 873 | 59 |
| 129 | **nat** | calm | peaceful state; without agitation | 872 | 58.6 |
| 130 | **sem** | bound | limit; edge; termination | 871 | 60.3 |
| 131 | **dabe** | surface | outer face; contact plane | 870 | 73.7 |
| 132 | **dafa** | edge | boundary line; periphery | 869 | 73 |
| 133 | **fade** | center | middle point; core locus | 868 | 76.7 |
| 134 | **tel** | field | extended spread; open area | 867 | 61.9 |
| 135 | **faba** | reach | extension toward; span of influence | 866 | 75.4 |
| 136 | **gafe** | void | absence; empty interior | 865 | 79.7 |
| 137 | **san** | container | held interior; volume that receives | 864 | 59.6 |
| 138 | **kak** | threshold | liminal crossing; doorway state | 863 | 55.1 |
| 139 | **gal** | envelope | wrapping boundary; outer shell | 862 | 54.1 |
| 140 | **gada** | probe | directed extension from a point | 861 | 78.4 |
| 141 | **kage** | wave | propagating disturbance; oscillation | 860 | 82.7 |
| 142 | **tat** | weave | interlaced pattern; braided structure | 859 | 61 |
| 143 | **nas** | lattice | organized structure; regular grid | 858 | 58.8 |
| 144 | **tam** | material | physical stuff at boundary | 857 | 60.9 |
| 145 | **daga** | group | collective cavity; many in one volume | 856 | 73.3 |
| 146 | **mabe** | motion | undergoing passage; transit state | 855 | 87.2 |
| 147 | **ru** | fast | high speed; quick motion | 854 | 39 |
| 148 | **kaba** | slow | low speed; gradual motion | 853 | 80.8 |
| 149 | **yo** | strong | high force or intensity | 852 | 25 |
| 150 | **fage** | weak | low force or intensity | 851 | 77 |
| 151 | **di** | new | recent; not old | 850 | 4 |
| 152 | **pu** | old | aged; not new | 849 | 35 |
| 153 | **mada** | more | greater quantity; additional | 848 | 86.5 |
| 154 | **sade** | less | smaller quantity; reduced | 847 | 92.9 |
| 155 | **wo** | few | small number; not many | 846 | 24 |
| 156 | **bi** | what | interrogative for thing or action | 845 | 3 |
| 157 | **sawa** | who | interrogative for person | 844 | 102.5 |
| 158 | **kafe** | when | interrogative for time | 843 | 82.4 |
| 159 | **faha** | where | interrogative for place | 842 | 93 |
| 160 | **su** | why | interrogative for reason | 841 | 13 |
| 161 | **li** | how | interrogative for manner | 840 | 8 |
| 162 | **gabe** | if | conditional; supposing that | 839 | 79.1 |
| 163 | **do** | because | causal connector; for the reason | 838 | 5 |
| 164 | **gaya** | always | at all times; without exception | 837 | 95.5 |
| 165 | **fu** | never | at no time; not ever | 836 | 7 |
| 166 | **mafe** | again | once more; repeated occurrence | 835 | 87.8 |
| 167 | **maga** | day | light period; solar cycle phase | 834 | 87.1 |
| 168 | **bo** | night | dark period; absence of day | 833 | 4 |
| 169 | **sage** | above | higher than reference; overhead | 832 | 93.5 |
| 170 | **safa** | below | lower than reference; under | 831 | 92.2 |
| 171 | **hu** | left | side opposite right | 830 | 24 |
| 172 | **nade** | right | side opposite left | 829 | 90.2 |
| 173 | **kada** | front | forward-facing side | 828 | 81.1 |
| 174 | **yu** | back | rear-facing side | 827 | 26 |
| 175 | **daha** | wood | plant-derived hard material | 826 | 91.5 |
| 176 | **dage** | metal | hard shiny elemental material | 825 | 74.3 |
| 177 | **wu** | blood | vital fluid of body | 824 | 25 |
| 178 | **nawa** | bone | rigid skeletal structure | 823 | 101 |
| 179 | **sabe** | skin | outer covering of body | 822 | 92.6 |
| 180 | **faya** | foot | lower extremity for standing | 821 | 94 |
| 181 | **nafe** | voice | sound of speech; vocal emission | 820 | 90.5 |
| 182 | **lu** | sound | audible vibration; heard phenomenon | 819 | 10 |
| 183 | **lel** | touch | tactile contact; feel physically | 818 | 57.1 |
| 184 | **mes** | smell | olfactory perception; scent | 817 | 58.2 |
| 185 | **tade** | taste | gustatory perception; flavor | 816 | 95.6 |
| 186 | **naba** | color | visual quality of hue | 815 | 88.9 |
| 187 | **dek** | shape | geometric form; outline | 814 | 52.1 |
| 188 | **let** | pattern | repeating arrangement; regularity | 813 | 56.8 |
| 189 | **lam** | number | quantity symbol; count | 812 | 56.1 |
| 190 | **men** | two | pair; quantity of two | 811 | 57.8 |
| 191 | **gaha** | three | quantity of three | 810 | 94.5 |
| 192 | **dem** | first | initial in sequence | 809 | 51.9 |
| 193 | **bal** | last | final in sequence | 808 | 50.5 |
| 194 | **tafa** | open | not closed; accessible | 807 | 94.9 |
| 195 | **nage** | close | shut; not open | 806 | 90.8 |
| 196 | **las** | full | containing maximum; not empty | 805 | 56.4 |
| 197 | **bak** | empty | containing nothing; not full | 804 | 50.3 |
| 198 | **len** | wet | covered with liquid; moist | 803 | 56.6 |
| 199 | **tabe** | dry | without liquid; not wet | 802 | 95.3 |
| 200 | **kawa** | hard | firm resistance; not soft | 801 | 96.5 |

## Commands

```bash
npm run fonoran:primitive-roots          # generate JSON + import to lab bucket
npm run fonoran:primitive-roots:gen        # generate JSON only
npm run fonoran:primitive-roots:import     # import existing JSON → Dictionary
```

*Related: [fonoran-grammar.md](fonoran-grammar.md) · [fonoran-generator-archive.md](fonoran-generator-archive.md)*
