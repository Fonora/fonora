# Fonoran compound audit

> Generated: 2026-07-03T03:41:09.820Z

## Summary

| Metric | Value |
| --- | --- |
| Live compounds | 127 |
| Demo reference trees | 53 |
| Missing from live | 2 |
| Tree mismatches | 30 |
| Broken dependencies | 0 |
| Tree-aware preferred forms | 22 |
| Seed coverage | 127/127 |
| Empty alternates | 0 |
| Flattened length warnings (>4 roots) | 0 |
| Would promote (run optimize) | 0 |
| LLM evaluated / consensus / split | 109 / 16 / 76 |
| LLM would promote / low recovery | 33 / 46 |
| Heuristic preferred / locked | 122 / 0 |
| Playtested concepts | 70 |

### Findings by severity

- **critical**: 0
- **high**: 29
- **medium**: 153
- **low**: 0

### Phonetic ease

- Communicative-core roots: 50 (avg cost 39.2)
- Core on tertiary onsets: 5
- Extended-core avg cost: 46.4

Tertiary-onset roots:
- `up` → ra (communicative_core)
- `down` → ju (communicative_core)
- `place` → che (communicative_core)
- `after` → shu (extended_core)
- `less` → sha (extended_core)
- `fear` → pe (communicative_core)
- `conflict` → pa (extended_core)
- `bone` → je (extended_core)
- `heart` → pu (extended_core)
- `metal` → ja (extended_core)
- `tree` → she (extended_core)
- `left` → chu (extended_core)
- `understand` → cha (communicative_core)
- `child` → re (extended_core)

## Findings

### High

- **answer** (flat_when_hierarchical): Demo depth 2 but preferred uses only primitive roots
- **answer** (tree_mismatch): Preferred tree differs from semantic foundation
  - expected: `speak+knowledge`
  - live: `speak+know`
- **book** (tree_mismatch): Preferred tree differs from semantic foundation
  - expected: `knowledge+thing`
  - live: `speak+knowledge`
- **document** (tree_mismatch): Preferred tree differs from semantic foundation
  - expected: `mark+thing+know`
  - live: `thing+mark`
- **down** (core_tertiary_onset): Communicative-core root "ju" uses tertiary onset (j)
- **fear** (core_tertiary_onset): Communicative-core root "pe" uses tertiary onset (p)
- **government** (tree_mismatch): Preferred tree differs from semantic foundation
  - expected: `community+hold+strong`
  - live: `community+strong`
- **identity** (flat_when_hierarchical): Demo depth 2 but preferred uses only primitive roots
- **identity** (tree_mismatch): Preferred tree differs from semantic foundation
  - expected: `self+memory`
  - live: `self+know`
- **language** (flat_when_hierarchical): Demo depth 2 but preferred uses only primitive roots
- **language** (tree_mismatch): Preferred tree differs from semantic foundation
  - expected: `speak+shared_meaning`
  - live: `collective+speak`
- **law** (flat_when_hierarchical): Demo depth 2 but preferred uses only primitive roots
- **law** (tree_mismatch): Preferred tree differs from semantic foundation
  - expected: `bond+collective+still`
  - live: `collective+still`
- **money** (tree_mismatch): Preferred tree differs from semantic foundation
  - expected: `exchange+equal+thing`
  - live: `thing+exchange`
- **nation** (flat_when_hierarchical): Demo depth 4 but preferred uses only primitive roots
- **nation** (tree_mismatch): Preferred tree differs from semantic foundation
  - expected: `tribe+bound+place`
  - live: `collective+place`
- **place** (core_tertiary_onset): Communicative-core root "che" uses tertiary onset (ch)
- **religion** (tree_mismatch): Preferred tree differs from semantic foundation
  - expected: `collective+bond+source`
  - live: `bond+source`
- **teacher** (flat_when_hierarchical): Demo depth 2 but preferred uses only primitive roots
- **teacher** (tree_mismatch): Preferred tree differs from semantic foundation
  - expected: `person+knowledge+give`
  - live: `give+know+person`
- **tool** (flat_when_hierarchical): Demo depth 2 but preferred uses only primitive roots
- **tool** (tree_mismatch): Preferred tree differs from semantic foundation
  - expected: `thing+hand+useful`
  - live: `hand+thing`
- **tribe** (tree_mismatch): Preferred tree differs from semantic foundation
  - expected: `community+identity`
  - live: `community+bond`
- **understand** (core_tertiary_onset): Communicative-core root "cha" uses tertiary onset (ch)
- **up** (core_tertiary_onset): Communicative-core root "ra" uses tertiary onset (r)
- **work** (flat_when_hierarchical): Demo depth 2 but preferred uses only primitive roots
- **work** (tree_mismatch): Preferred tree differs from semantic foundation
  - expected: `person+do+will`
  - live: `person+make`
- **world** (flat_when_hierarchical): Demo depth 2 but preferred uses only primitive roots
- **world** (tree_mismatch): Preferred tree differs from semantic foundation
  - expected: `whole+place+earth+life`
  - live: `earth+all`
### Medium

- **agent** (llm_low_recovery): Live preferred recovers at 0% in LLM playtests
- **agent** (llm_split): LLM playtests have no clear consensus winner
- **almost** (llm_split): LLM playtests have no clear consensus winner
- **answer** (llm_low_recovery): Live preferred recovers at 0% in LLM playtests
- **answer** (llm_split): LLM playtests have no clear consensus winner
- **beautiful** (llm_low_recovery): Live preferred recovers at 0% in LLM playtests
- **beautiful** (llm_split): LLM playtests have no clear consensus winner
- **birth** (llm_low_recovery): Live preferred recovers at 0% in LLM playtests
- **birth** (llm_split): LLM playtests have no clear consensus winner
- **birthplace** (llm_split): LLM playtests have no clear consensus winner
- **blacksmith** (llm_low_recovery): Live preferred recovers at 0% in LLM playtests
- **blacksmith** (llm_would_promote): LLM consensus would promote metal + person → metal + make + person
- **book** (llm_low_recovery): Live preferred recovers at 0% in LLM playtests
- **book** (llm_split): LLM playtests have no clear consensus winner
- **breath** (llm_split): LLM playtests have no clear consensus winner
- **bridge** (llm_split): LLM playtests have no clear consensus winner
- **campfire** (llm_low_recovery): Live preferred recovers at 0% in LLM playtests
- **campfire** (llm_would_promote): LLM consensus would promote fire + near → fire + place
- **city** (llm_split): LLM playtests have no clear consensus winner
- **cloud** (llm_low_recovery): Live preferred recovers at 0% in LLM playtests
- **cloud** (llm_split): LLM playtests have no clear consensus winner
- **community** (llm_low_recovery): Live preferred recovers at 50% in LLM playtests
- **community** (llm_would_promote): LLM consensus would promote bond + collective → collective + person
- **community** (tree_mismatch): Preferred tree differs from semantic foundation
  - expected: `collective+person`
  - live: `bond+collective`
- **container** (llm_split): LLM playtests have no clear consensus winner
- **cycle** (llm_low_recovery): Live preferred recovers at 0% in LLM playtests
- **cycle** (llm_split): LLM playtests have no clear consensus winner
- **day** (llm_low_recovery): Live preferred recovers at 25% in LLM playtests
- **day** (llm_split): LLM playtests have no clear consensus winner
- **doctor** (llm_split): LLM playtests have no clear consensus winner
- **document** (llm_low_recovery): Live preferred recovers at 0% in LLM playtests
- **document** (llm_split): LLM playtests have no clear consensus winner
- **door** (llm_split): LLM playtests have no clear consensus winner
- **enemy** (llm_split): LLM playtests have no clear consensus winner
- **exchange** (llm_split): LLM playtests have no clear consensus winner
- **family** (llm_low_recovery): Live preferred recovers at 0% in LLM playtests
- **family** (llm_would_promote): LLM consensus would promote person + bond → parent + collective
- **farmer** (llm_low_recovery): Live preferred recovers at 50% in LLM playtests
- **farmer** (llm_would_promote): LLM consensus would promote plant + person → make + plant + person
- **fisherman** (llm_split): LLM playtests have no clear consensus winner
- **fly** (llm_low_recovery): Live preferred recovers at 0% in LLM playtests
- **fly** (llm_would_promote): LLM consensus would promote move + air → sky + move
- **forest** (llm_split): LLM playtests have no clear consensus winner
- **forest** (tree_mismatch): Preferred tree differs from semantic foundation
  - expected: `many+plant+place`
  - live: `many+tree`
- **forget** (llm_split): LLM playtests have no clear consensus winner
- **friend** (llm_low_recovery): Live preferred recovers at 0% in LLM playtests
- **friend** (llm_would_promote): LLM consensus would promote good + person → person + bond + good
- **friend** (tree_mismatch): Preferred tree differs from semantic foundation
  - expected: `person+bond+good`
  - live: `good+person`
- **gift** (llm_low_recovery): Live preferred recovers at 50% in LLM playtests
- **gift** (llm_split): LLM playtests have no clear consensus winner
- **gift** (tree_mismatch): Preferred tree differs from semantic foundation
  - expected: `give+thing+good`
  - live: `good+give`
- **government** (llm_low_recovery): Live preferred recovers at 0% in LLM playtests
- **government** (llm_split): LLM playtests have no clear consensus winner
- **grandparent** (llm_split): LLM playtests have no clear consensus winner
- **grow** (llm_low_recovery): Live preferred recovers at 0% in LLM playtests
- **grow** (llm_would_promote): LLM consensus would promote life + more → life + change + more
- **grow** (tree_mismatch): Preferred tree differs from semantic foundation
  - expected: `life+change+more`
  - live: `life+more`
- **heal** (llm_split): LLM playtests have no clear consensus winner
- **helper** (llm_split): LLM playtests have no clear consensus winner
- **home** (llm_split): LLM playtests have no clear consensus winner
- **hunter** (llm_split): LLM playtests have no clear consensus winner
- **identity** (llm_low_recovery): Live preferred recovers at 0% in LLM playtests
- **identity** (llm_split): LLM playtests have no clear consensus winner
- **island** (llm_split): LLM playtests have no clear consensus winner
- **journey** (llm_low_recovery): Live preferred recovers at 0% in LLM playtests
- **journey** (llm_would_promote): LLM consensus would promote far + move → move + path
- **joy** (llm_split): LLM playtests have no clear consensus winner
- **knife** (llm_split): LLM playtests have no clear consensus winner
- **lake** (llm_low_recovery): Live preferred recovers at 25% in LLM playtests
- **lake** (llm_split): LLM playtests have no clear consensus winner
- **lamp** (llm_split): LLM playtests have no clear consensus winner
- **language** (llm_low_recovery): Live preferred recovers at 0% in LLM playtests
- **language** (llm_would_promote): LLM consensus would promote collective + speak → speak + collective + know
- **law** (llm_low_recovery): Live preferred recovers at 0% in LLM playtests
- **law** (llm_split): LLM playtests have no clear consensus winner
- **learn** (llm_split): LLM playtests have no clear consensus winner
- **meal** (llm_split): LLM playtests have no clear consensus winner
- **meal** (tree_mismatch): Preferred tree differs from semantic foundation
  - expected: `food+thing`
  - live: `food+eat`
- **meaning** (llm_split): LLM playtests have no clear consensus winner
- **memory** (llm_split): LLM playtests have no clear consensus winner
- **money** (llm_low_recovery): Live preferred recovers at 0% in LLM playtests
- **money** (llm_split): LLM playtests have no clear consensus winner
- **moonlight** (llm_split): LLM playtests have no clear consensus winner
- **morning** (llm_low_recovery): Live preferred recovers at 0% in LLM playtests
- **morning** (llm_split): LLM playtests have no clear consensus winner
- **mountain** (llm_low_recovery): Live preferred recovers at 0% in LLM playtests
- **mountain** (llm_split): LLM playtests have no clear consensus winner
- **mountain** (tree_mismatch): Preferred tree differs from semantic foundation
  - expected: `earth+up+still`
  - live: `earth+up`
- **music** (llm_low_recovery): Live preferred recovers at 0% in LLM playtests
- **music** (llm_split): LLM playtests have no clear consensus winner
- **music** (tree_mismatch): Preferred tree differs from semantic foundation
  - expected: `speak+pulse+joy`
  - live: `pulse+good`
- **nation** (llm_low_recovery): Live preferred recovers at 0% in LLM playtests
- **nation** (llm_split): LLM playtests have no clear consensus winner
- **ocean** (llm_split): LLM playtests have no clear consensus winner
- **ocean** (tree_mismatch): Preferred tree differs from semantic foundation
  - expected: `water+place+many`
  - live: `water+big`
- **open** (llm_split): LLM playtests have no clear consensus winner
- **peace** (llm_low_recovery): Live preferred recovers at 0% in LLM playtests
- **peace** (llm_split): LLM playtests have no clear consensus winner
- **peace** (tree_mismatch): Preferred tree differs from semantic foundation
  - expected: `collective+conflict+empty`
  - live: `collective+good`
- **people** (llm_split): LLM playtests have no clear consensus winner
- **question** (llm_low_recovery): Live preferred recovers at 0% in LLM playtests
- **question** (llm_split): LLM playtests have no clear consensus winner
- **question** (tree_mismatch): Preferred tree differs from semantic foundation
  - expected: `speak+know+empty`
  - live: `want+know`
- **rain** (llm_low_recovery): Live preferred recovers at 0% in LLM playtests
- **rain** (llm_would_promote): LLM consensus would promote water + down → sky + water
- **red** (llm_split): LLM playtests have no clear consensus winner
- **religion** (llm_low_recovery): Live preferred recovers at 0% in LLM playtests
- **religion** (llm_split): LLM playtests have no clear consensus winner
- **remember** (llm_split): LLM playtests have no clear consensus winner
- **river** (tree_mismatch): Preferred tree differs from semantic foundation
  - expected: `water+flow+path`
  - live: `flow+water`
- **road** (llm_split): LLM playtests have no clear consensus winner
- **run** (llm_low_recovery): Live preferred recovers at 0% in LLM playtests
- **run** (llm_would_promote): LLM consensus would promote move + fast → fast + move
- **sad** (llm_split): LLM playtests have no clear consensus winner
- **sea** (llm_split): LLM playtests have no clear consensus winner
- **seed** (llm_split): LLM playtests have no clear consensus winner
- **shared_meaning** (llm_low_recovery): Live preferred recovers at 0% in LLM playtests
- **shared_meaning** (llm_split): LLM playtests have no clear consensus winner
- **shared_meaning** (tree_mismatch): Preferred tree differs from semantic foundation
  - expected: `collective+know+same`
  - live: `speak+same`
- **signal** (llm_low_recovery): Live preferred recovers at 0% in LLM playtests
- **signal** (llm_split): LLM playtests have no clear consensus winner
- **star** (llm_split): LLM playtests have no clear consensus winner
- **student** (llm_split): LLM playtests have no clear consensus winner
- **sun** (tree_mismatch): Preferred tree differs from semantic foundation
  - expected: `source+light+hot`
  - live: `sky+fire`
- **sunrise** (llm_low_recovery): Live preferred recovers at 0% in LLM playtests
- **sunrise** (llm_split): LLM playtests have no clear consensus winner
- **sunset** (llm_low_recovery): Live preferred recovers at 25% in LLM playtests
- **sunset** (llm_split): LLM playtests have no clear consensus winner
- **swim** (llm_split): LLM playtests have no clear consensus winner
- **teacher** (llm_low_recovery): Live preferred recovers at 0% in LLM playtests
- **teacher** (llm_split): LLM playtests have no clear consensus winner
- **thought** (llm_split): LLM playtests have no clear consensus winner
- **tool** (llm_split): LLM playtests have no clear consensus winner
- **trade** (llm_split): LLM playtests have no clear consensus winner
- **tribe** (llm_low_recovery): Live preferred recovers at 0% in LLM playtests
- **tribe** (llm_split): LLM playtests have no clear consensus winner
- **vehicle** (llm_split): LLM playtests have no clear consensus winner
- **village** (llm_split): LLM playtests have no clear consensus winner
- **voice** (llm_low_recovery): Live preferred recovers at 0% in LLM playtests
- **voice** (llm_would_promote): LLM consensus would promote person + speak → speak + breath
- **voice** (tree_mismatch): Preferred tree differs from semantic foundation
  - expected: `speak+breath`
  - live: `person+speak`
- **war** (llm_split): LLM playtests have no clear consensus winner
- **weapon** (llm_split): LLM playtests have no clear consensus winner
- **whole** (llm_low_recovery): Live preferred recovers at 0% in LLM playtests
- **whole** (llm_split): LLM playtests have no clear consensus winner
- **winter** (llm_low_recovery): Live preferred recovers at 50% in LLM playtests
- **winter** (llm_would_promote): LLM consensus would promote cold + after → time + cold
- **word** (llm_low_recovery): Live preferred recovers at 0% in LLM playtests
- **word** (llm_would_promote): LLM consensus would promote thing + speak → speak + mark
- **work** (llm_low_recovery): Live preferred recovers at 0% in LLM playtests
- **work** (llm_split): LLM playtests have no clear consensus winner
- **wound** (llm_low_recovery): Live preferred recovers at 0% in LLM playtests
- **wound** (llm_would_promote): LLM consensus would promote pain + body → bad + skin
### Info

- **blacksmith** (llm_would_promote): LLM consensus prefers metal + make + person (25% recovery) over live preferred
- **campfire** (llm_would_promote): LLM consensus prefers fire + place (25% recovery) over live preferred
- **community** (llm_would_promote): LLM consensus prefers collective + person (100% recovery) over live preferred
- **family** (llm_would_promote): LLM consensus prefers parent + collective (100% recovery) over live preferred
- **farmer** (llm_would_promote): LLM consensus prefers make + plant + person (100% recovery) over live preferred
- **fly** (llm_would_promote): LLM consensus prefers sky + move (100% recovery) over live preferred
- **friend** (llm_would_promote): LLM consensus prefers person + bond + good (100% recovery) over live preferred
- **grow** (llm_would_promote): LLM consensus prefers life + change + more (50% recovery) over live preferred
- **journey** (llm_would_promote): LLM consensus prefers move + path (25% recovery) over live preferred
- **language** (llm_would_promote): LLM consensus prefers speak + collective + know (50% recovery) over live preferred
- **rain** (llm_would_promote): LLM consensus prefers sky + water (100% recovery) over live preferred
- **river** (llm_would_promote): LLM consensus prefers water + flow + path (100% recovery) over live preferred
- **run** (llm_would_promote): LLM consensus prefers fast + move (50% recovery) over live preferred
- **voice** (llm_would_promote): LLM consensus prefers speak + breath (50% recovery) over live preferred
- **winter** (llm_would_promote): LLM consensus prefers time + cold (100% recovery) over live preferred
- **word** (llm_would_promote): LLM consensus prefers speak + mark (100% recovery) over live preferred
- **wound** (llm_would_promote): LLM consensus prefers bad + skin (100% recovery) over live preferred

## Teaching-tree dependency order

- `community` = bond + collective
- `family` = person + bond
- `exchange` = give + take
- `knowledge` = know + hold
- `memory` = know + hold + inside
- `remember` = know + before
- `forget` = know + empty
- `identity` = self + know
- `useful` = good + use
- `run` = move + fast
- `swim` = move + water
- `fly` = move + air
- `flow` = water + path
- `river` = flow + water [via: flow]
- `wind` = air + move
- `home` = place + bond
- `friend` = good + person
- `enemy` = person + conflict
- `road` = path + move
- `vehicle` = move + thing
- `meal` = food + eat
- `lamp` = light + thing
- `tool` = hand + thing
- `breath` = air + inside
- `voice` = person + speak
- `thought` = think + inside
- `shared_meaning` = speak + same
- `tribe` = community + bond [via: community]
- `war` = tribe + conflict [via: tribe]
- `village` = place + community [via: community]
- `language` = collective + speak
- `equal` = same + more
- `money` = thing + exchange [via: exchange]
- `teacher` = give + know + person
- `book` = speak + knowledge [via: knowledge]
- `mark` = see + name
- `document` = thing + mark [via: mark]
- `pulse` = heart + move
- `joy` = good + feel
- `music` = pulse + good [via: pulse]
- … and 87 more
