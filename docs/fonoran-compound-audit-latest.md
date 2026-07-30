# Fonoran compound audit

> Generated: 2026-07-29T19:43:03.530Z

## Summary

| Metric | Value |
| --- | --- |
| Live compounds | 454 |
| Demo reference trees | 52 |
| Missing from live | 2 |
| Tree mismatches | 31 |
| Broken dependencies | 0 |
| Tree-aware preferred forms | 10 |
| Seed coverage | 452/454 |
| Empty alternates | 0 |
| Flattened length warnings (>4 roots) | 0 |
| Would promote (run optimize) | 4 |
| Auditable against a gloss | 423 (31 glosses only restate the headword) |
| Every root named by the gloss | 129 |
| Gloss supports a listed candidate better | 90 (11 locked) |
| Heuristic preferred / locked | 397 / 57 |
| Playtest rounds on disk | 4257 (stale, not used in selection) |

### Findings by severity

- **critical**: 0
- **high**: 13
- **medium**: 110
- **low**: 67

### Phonetic ease

- Communicative-core roots: 50 (avg cost 38.0)
- Core on tertiary onsets: 2
- Extended-core avg cost: 43.2

Tertiary-onset roots:
- `after` → shu (extended_core)
- `angry` → she (extended_core)
- `conflict` → pa (extended_core)
- `fear` → pe (communicative_core)
- `front` → cha (extended_core)
- `less` → sha (fluent_core)
- `place` → che (communicative_core)
- `understand` → chu (extended_core)

## Findings

### High

- **boat** (gloss_mismatch): Gloss supports water + move (2/2 roots named) over preferred thing + water (1/2)
- **elder** (gloss_mismatch): Gloss supports person + before (2/2 roots named) over preferred person + back (1/2)
- **farmer** (gloss_mismatch): Gloss supports make + plant + person (2/3 roots named) over preferred plant + person (1/2)
- **fear** (core_tertiary_onset): Communicative-core root "pe" uses tertiary onset (p)
- **fresh_water_source** (gloss_mismatch): Gloss supports place + water (2/2 roots named) over preferred good + water (1/2)
- **heal** (gloss_mismatch): Gloss supports make + good (2/2 roots named) over preferred help + body (0/2)
- **hungry** (gloss_mismatch): Gloss supports need + eat (2/2 roots named) over preferred want + food (1/2)
- **island** (gloss_mismatch): Gloss supports earth + water (2/2 roots named) over preferred place + water (1/2)
- **language** (gloss_mismatch): Gloss supports speak + shared_meaning (2/2 roots named) over preferred collective + speak (1/2)
- **peace** (gloss_mismatch): Gloss supports collective + conflict + empty (2/3 roots named) over preferred empty + conflict (1/2)
- **place** (core_tertiary_onset): Communicative-core root "che" uses tertiary onset (ch)
- **question** (gloss_mismatch): Gloss supports speak + know + empty (2/3 roots named) over preferred want + know (1/2)
- **shared_meaning** (gloss_mismatch): Gloss supports collective + know + same (2/3 roots named) over preferred speak + same (1/2)
### Medium

- **acceptance** (near_confusable_pair): Surface "tines" is phonetically near "times" (staying, distinctness 92%)
- **afraid** (gloss_mismatch): Gloss supports feel + fear (2/2 roots named) over preferred fear + body (1/2)
- **ash** (gloss_mismatch): Gloss supports fire + after (2/2 roots named) over preferred fire + earth (1/2)
- **away** (near_confusable_pair): Surface "gifet" is phonetically near "difet" (long_ago, distinctness 92%)
- **bag** (gloss_mismatch): Gloss supports hold + inside (1/2 roots named) over preferred take + inside (0/2)
- **bandage** (gloss_mismatch): Gloss supports hold + wound (2/2 roots named) over preferred skin + hold (1/2)
- **basket** (near_confusable_pair): Surface "tetmes" is phonetically near "tesmes" (infection, distinctness 93%)
- **beginning** (gloss_mismatch): Gloss supports before + now (1/2 roots named) over preferred one + time (0/2)
- **behind** (gloss_mismatch): Gloss supports back + place (2/2 roots named) over preferred outside + back (1/2)
- **belongs** (would_promote): Optimizer would promote self + inside + collective → bond + place
- **birth** (gloss_mismatch): Gloss supports source + life (2/2 roots named) over preferred life + before (1/2)
- **bleeding** (gloss_mismatch): Gloss supports water + wound (1/2 roots named) over preferred move + pain (0/2)
- **bone_tool** (gloss_mismatch): Gloss supports bone + hand (1/2 roots named) over preferred stone + use (0/2)
- **book** (near_confusable_pair): Surface "kenhu" is phonetically near "kelhu" (teach, distinctness 92%)
- **bored** (gloss_mismatch): Gloss supports feel + empty (2/2 roots named) over preferred want + empty (1/2)
- **bowl** (gloss_mismatch): Gloss supports hold + eat (2/2 roots named) over preferred hold + inside + eat (2/3)
- **bridge** (gloss_mismatch): Gloss supports path + water (2/2 roots named) over preferred path + hold + water (2/3)
- **broken_bone** (gloss_mismatch): Gloss supports pain + bone (1/2 roots named) over preferred body + pain + bad (0/3)
- **bruise** (near_confusable_pair): Surface "tatgan" is phonetically near "tatgam" (rash, distinctness 93%)
- **campfire** (gloss_mismatch): Gloss supports fire + place (2/2 roots named) over preferred fire + near (1/2)
- **carrying** (near_confusable_pair): Surface "gatgi" is phonetically near "datgi" (torch, distinctness 92%)
- **catch** (near_confusable_pair): Surface "lanek" is phonetically near "lalek" (gather, distinctness 92%)
- **cloud** (gloss_mismatch): Gloss supports air + water (2/2 roots named) over preferred sky + water (1/2)
- **coal** (near_confusable_pair): Surface "datsas" is phonetically near "gatsas" (nail, distinctness 93%)
- **community** (gloss_mismatch): Gloss supports many + person (2/2 roots named) over preferred bond + collective (0/2)
- **cooked_food** (gloss_mismatch): Gloss supports hot + food (2/2 roots named) over preferred fire + food (1/2)
- **courage** (gloss_mismatch): Gloss supports do + fear (2/2 roots named) over preferred move + fear (1/2)
- **cross** (near_confusable_pair): Surface "gifel" is phonetically near "gifen" (fall, distinctness 92%)
- **danger** (gloss_mismatch): Gloss supports bad + near (2/2 roots named) over preferred near + pain (1/2)
- **dangerous_ground** (near_confusable_pair): Surface "chegam" is phonetically near "chekam" (meeting_point, distinctness 95%)
- **dangerous_ground** (near_confusable_pair): Surface "chegam" is phonetically near "chegan" (hidden_place, distinctness 93%)
- **dehydration** (gloss_mismatch): Gloss supports empty + body (1/2 roots named) over preferred need + drink (0/2)
- **desert** (near_confusable_pair): Surface "fentam" is phonetically near "fensam" (high_ground, distinctness 93%)
- **desert** (near_confusable_pair): Surface "fentam" is phonetically near "femtam" (tired, distinctness 93%)
- **determination** (gloss_mismatch): Gloss supports hold + do (2/2 roots named) over preferred want + hold (1/2)
- **disgust** (gloss_mismatch): Gloss supports bad + feel + taste (3/3 roots named) over preferred feel + bad + eat (2/3)
- **distraction** (near_confusable_pair): Surface "gimet" is phonetically near "dimet" (plan, distinctness 92%)
- **doctor** (gloss_mismatch): Gloss supports heal + person (1/2 roots named) over preferred good + body + person (0/3)
- **downward** (near_confusable_pair): Surface "fengi" is phonetically near "felgi" (pass, distinctness 92%)
- **duration** (near_confusable_pair): Surface "gatkan" is phonetically near "gatkam" (tie, distinctness 93%)
- **duration** (near_confusable_pair): Surface "gatkan" is phonetically near "gatkal" (trap, distinctness 93%)
- **ear** (near_confusable_pair): Surface "lenfem" is phonetically near "lemfem" (fever, distinctness 93%)
- **enemy** (gloss_mismatch): Gloss supports person + conflict (2/2 roots named) over preferred bad + person (1/2)
- **enemy** (near_confusable_pair): Surface "gamba" is phonetically near "kamba" (partner, distinctness 94%)
- **exhaustion** (gloss_mismatch): Gloss supports empty + body (1/2 roots named) over preferred need + sleep (0/2)
- **family** (gloss_mismatch): Gloss supports person + bond (2/2 roots named) over preferred love + person (1/2)
- **fire_making** (gloss_mismatch): Gloss supports make + fire (2/2 roots named) over preferred hand + fire (1/2)
- **fisherman** (gloss_mismatch): Gloss supports fish + person (1/2 roots named) over preferred water + animal + person (0/3)
- **flood** (gloss_mismatch): Gloss supports water + earth (2/2 roots named) over preferred many + water (1/2)
- **forest** (gloss_mismatch): Gloss supports many + plant + place (3/3 roots named) over preferred many + tree (1/2)
- **fresh_water_source** (near_confusable_pair): Surface "guye" is phonetically near "kuye" (pour, distinctness 93%)
- **gather** (gloss_mismatch): Gloss supports move + inside (1/2 roots named) over preferred take + many (0/2)
- **grass** (gloss_mismatch): Gloss supports earth + plant + small (2/3 roots named) over preferred plant + small (1/2)
- **grow** (gloss_mismatch): Gloss supports change + life (2/2 roots named) over preferred life + more (1/2)
- **hidden** (near_confusable_pair): Surface "tigan" is phonetically near "tikan" (pause, distinctness 94%)
- **high_ground** (gloss_mismatch): Gloss supports up + earth (2/2 roots named) over preferred earth + sky (1/2)
- **high_place** (near_confusable_pair): Surface "chesam" is phonetically near "chetam" (open_space, distinctness 93%)
- **hunter** (gloss_mismatch): Gloss supports animal + take (2/2 roots named) over preferred take + animal + person (2/3)
- **ice** (gloss_mismatch): Gloss supports water + still (1/2 roots named) over preferred cold + stone (0/2)
- **identity** (gloss_mismatch): Gloss supports self + memory (2/2 roots named) over preferred self + know (1/2)
- **imagine** (gloss_mismatch): Gloss supports think + make (2/2 roots named) over preferred think + see (1/2)
- **insect** (near_confusable_pair): Surface "kalgen" is phonetically near "kangen" (instant, distinctness 93%)
- **inward** (gloss_mismatch): Gloss supports move + inside (2/2 roots named) over preferred path + inside (1/2)
- **lake** (gloss_mismatch): Gloss supports water + still (2/2 roots named) over preferred water + hold (1/2)
- **late** (gloss_mismatch): Gloss supports after + now (2/2 roots named) over preferred after + good (1/2)
- **later** (gloss_mismatch): Gloss supports after + now (2/2 roots named) over preferred after + time (1/2)
- **low_place** (gloss_mismatch): Gloss supports place + earth (1/2 roots named) over preferred earth + near (0/2)
- **meeting_point** (near_confusable_pair): Surface "chekam" is phonetically near "chetam" (open_space, distinctness 93%)
- **money** (gloss_mismatch): Gloss supports equal + exchange (2/2 roots named) over preferred give + take + equal (1/3)
- **morning** (gloss_mismatch): Gloss supports sun + before (2/2 roots named) over preferred light + after (0/2)
- **mountain** (gloss_mismatch): Gloss supports earth + big + still (2/3 roots named) over preferred stone + big + still (1/3)
- **needle** (gloss_mismatch): Gloss supports small + through (2/2 roots named) over preferred hand + through (1/2)
- **never** (gloss_mismatch): Gloss supports all + time + empty (2/3 roots named) over preferred empty + time (1/2)
- **ocean** (gloss_mismatch): Gloss supports water + place + many (2/3 roots named) over preferred water + big (1/2)
- **old** (gloss_mismatch): Gloss supports far + before (2/2 roots named) over preferred body + before (1/2)
- **old** (near_confusable_pair): Surface "femdi" is phonetically near "femti" (still_raw, distinctness 94%)
- **partner** (gloss_mismatch): Gloss supports near + bond + person (2/3 roots named) over preferred bond + person (1/2)
- **pause** (gloss_mismatch): Gloss supports still + now (2/2 roots named) over preferred still + time (1/2)
- **permanent** (gloss_mismatch): Gloss supports still + time + all (1/3 roots named) over preferred still + all (0/2)
- **pot** (gloss_mismatch): Gloss supports fire + eat (2/2 roots named) over preferred hot + hold (0/2)
- **rain** (gloss_mismatch): Gloss supports sky + water (1/2 roots named) over preferred sky + water + move (1/3)
- **raindrop** (would_promote): Optimizer would promote water + small + sky → sky + water + small
- **refuse** (gloss_mismatch): Gloss supports speak + want + back (1/3 roots named) over preferred take + back (0/2)
- **religion** (gloss_mismatch): Gloss supports collective + bond + source (3/3 roots named) over preferred bond + sky (1/2)
- **repeat** (gloss_mismatch): Gloss supports around + do (1/2 roots named) over preferred do + same (0/2)
- **return** (gloss_mismatch): Gloss supports move + back + here (3/3 roots named) over preferred move + around + here (2/3)
- **safe** (gloss_mismatch): Gloss supports empty + fear (1/2 roots named) over preferred bond + good (0/2)
- **seafood** (would_promote): Optimizer would promote food + fish → food + water + animal
- **shake** (gloss_mismatch): Gloss supports around + move (1/2 roots named) over preferred body + around + fast (0/3)
- **shortcut** (gloss_mismatch): Gloss supports path + fast (2/2 roots named) over preferred path + less (1/2)
- **shrink** (gloss_mismatch): Gloss supports change + small (2/2 roots named) over preferred less + big (1/2)
- **soon** (gloss_mismatch): Gloss supports now + after (1/2 roots named) over preferred near + after (0/2)
- **spin** (gloss_mismatch): Gloss supports move + around (2/2 roots named) over preferred body + move + around (2/3)
- **student** (gloss_mismatch): Gloss supports learn + person (1/2 roots named) over preferred take + know + person (0/3)
- **sun** (gloss_mismatch): Gloss supports source + light + hot (3/3 roots named) over preferred sky + fire (1/2)
- **sunrise** (gloss_mismatch): Gloss supports sun + before (1/2 roots named) over preferred sky + fire + before (0/3)
- **sunset** (gloss_mismatch): Gloss supports sun + after (1/2 roots named) over preferred sky + fire + after (0/3)
- **swamp** (gloss_mismatch): Gloss supports earth + water (1/2 roots named) over preferred earth + water + many (1/3)
- **swollen** (gloss_mismatch): Gloss supports body + big (1/2 roots named) over preferred skin + big (0/2)
- **tomorrow** (no_seeds): No ASSOCIATION_SEEDS entry
- **tongue** (gloss_mismatch): Gloss supports mouth + taste (2/2 roots named) over preferred body + taste (1/2)
- **trade** (gloss_mismatch): Gloss supports exchange + person (2/2 roots named) over preferred give + take + person (1/3)
- **tribe** (gloss_mismatch): Gloss supports community + identity (2/2 roots named) over preferred collective + person + bond (1/3)
- **upward** (gloss_mismatch): Gloss supports move + sky (1/2 roots named) over preferred path + sky (0/2)
- **voice** (gloss_mismatch): Gloss supports speak + breath (2/2 roots named) over preferred person + speak (1/2)
- **war** (gloss_mismatch): Gloss supports tribe + conflict (2/2 roots named) over preferred collective + conflict + person (2/3)
- **weapon** (gloss_mismatch): Gloss supports tool + conflict (2/2 roots named) over preferred hand + conflict (1/2)
- **window** (gloss_mismatch): Gloss supports see + through (2/2 roots named) over preferred see + hold (1/2)
- **wrist** (would_promote): Optimizer would promote bond + hand → hand + bound
- **yesterday** (no_seeds): No ASSOCIATION_SEEDS entry
### Low

- **belong** (uninformative_gloss): Gloss only restates the headword, so the composition cannot be checked against it
- **belongs** (uninformative_gloss): Gloss only restates the headword, so the composition cannot be checked against it
- **boil** (uninformative_gloss): Gloss only restates the headword, so the composition cannot be checked against it
- **borrow** (uninformative_gloss): Gloss only restates the headword, so the composition cannot be checked against it
- **breathe** (uninformative_gloss): Gloss only restates the headword, so the composition cannot be checked against it
- **clearly** (uninformative_gloss): Gloss only restates the headword, so the composition cannot be checked against it
- **closer** (uninformative_gloss): Gloss only restates the headword, so the composition cannot be checked against it
- **community** (tree_mismatch): Preferred tree differs from reference demo tree (advisory)
  - expected: `collective+person`
  - live: `bond+collective`
- **document** (tree_mismatch): Preferred tree differs from reference demo tree (advisory)
  - expected: `mark+know`
  - live: `know+mark`
- **enemy** (tree_mismatch): Preferred tree differs from reference demo tree (advisory)
  - expected: `person+conflict`
  - live: `bad+person`
- **enter** (uninformative_gloss): Gloss only restates the headword, so the composition cannot be checked against it
- **exit** (uninformative_gloss): Gloss only restates the headword, so the composition cannot be checked against it
- **family** (tree_mismatch): Preferred tree differs from reference demo tree (advisory)
  - expected: `person+bond`
  - live: `love+person`
- **fonoran** (uninformative_gloss): Gloss only restates the headword, so the composition cannot be checked against it
- **forest** (tree_mismatch): Preferred tree differs from reference demo tree (advisory)
  - expected: `many+plant+place`
  - live: `many+tree`
- **forget** (tree_mismatch): Preferred tree differs from reference demo tree (advisory)
  - expected: `know+empty`
  - live: `empty+know`
- **friend** (tree_mismatch): Preferred tree differs from reference demo tree (advisory)
  - expected: `person+bond+good`
  - live: `good+person`
- **gift** (tree_mismatch): Preferred tree differs from reference demo tree (advisory)
  - expected: `give+thing+good`
  - live: `good+give`
- **government** (tree_mismatch): Preferred tree differs from reference demo tree (advisory)
  - expected: `collective+rule`
  - live: `community+strong`
- **grow** (tree_mismatch): Preferred tree differs from reference demo tree (advisory)
  - expected: `life+change+more`
  - live: `life+more`
- **home** (tree_mismatch): Preferred tree differs from reference demo tree (advisory)
  - expected: `place+bond`
  - live: `sleep+place`
- **lamp** (tree_mismatch): Preferred tree differs from reference demo tree (advisory)
  - expected: `light+hold`
  - live: `light+use`
- **laugh** (uninformative_gloss): Gloss only restates the headword, so the composition cannot be checked against it
- **law** (tree_mismatch): Preferred tree differs from reference demo tree (advisory)
  - expected: `collective+rule`
  - live: `collective+still`
- **long** (uninformative_gloss): Gloss only restates the headword, so the composition cannot be checked against it
- **maybe** (uninformative_gloss): Gloss only restates the headword, so the composition cannot be checked against it
- **meal** (tree_mismatch): Preferred tree differs from reference demo tree (advisory)
  - expected: `food+thing`
  - live: `food+eat`
- **mistake** (uninformative_gloss): Gloss only restates the headword, so the composition cannot be checked against it
- **money** (flat_when_hierarchical): Demo depth 2 but preferred uses only primitive roots (allowed)
- **money** (tree_mismatch): Preferred tree differs from reference demo tree (advisory)
  - expected: `equal+exchange`
  - live: `give+take+equal`
- **mountain** (tree_mismatch): Preferred tree differs from reference demo tree (advisory)
  - expected: `earth+up+still`
  - live: `stone+big+still`
- **music** (tree_mismatch): Preferred tree differs from reference demo tree (advisory)
  - expected: `speak+pulse+joy`
  - live: `joy+speak`
- **ocean** (tree_mismatch): Preferred tree differs from reference demo tree (advisory)
  - expected: `water+place+many`
  - live: `water+big`
- **other** (uninformative_gloss): Gloss only restates the headword, so the composition cannot be checked against it
- **peace** (tree_mismatch): Preferred tree differs from reference demo tree (advisory)
  - expected: `collective+conflict+empty`
  - live: `empty+conflict`
- **plan** (uninformative_gloss): Gloss only restates the headword, so the composition cannot be checked against it
- **please** (uninformative_gloss): Gloss only restates the headword, so the composition cannot be checked against it
- **question** (tree_mismatch): Preferred tree differs from reference demo tree (advisory)
  - expected: `speak+know+empty`
  - live: `want+know`
- **raindrop** (uninformative_gloss): Gloss only restates the headword, so the composition cannot be checked against it
- **raindrops** (uninformative_gloss): Gloss only restates the headword, so the composition cannot be checked against it
- **ready** (uninformative_gloss): Gloss only restates the headword, so the composition cannot be checked against it
- **relieved** (uninformative_gloss): Gloss only restates the headword, so the composition cannot be checked against it
- **religion** (tree_mismatch): Preferred tree differs from reference demo tree (advisory)
  - expected: `collective+bond+hope`
  - live: `bond+sky`
- **river** (tree_mismatch): Preferred tree differs from reference demo tree (advisory)
  - expected: `water+flow+path`
  - live: `water+path`
- **shared_meaning** (tree_mismatch): Preferred tree differs from reference demo tree (advisory)
  - expected: `collective+know+same`
  - live: `speak+same`
- **show** (uninformative_gloss): Gloss only restates the headword, so the composition cannot be checked against it
- **sit** (uninformative_gloss): Gloss only restates the headword, so the composition cannot be checked against it
- **slowly** (uninformative_gloss): Gloss only restates the headword, so the composition cannot be checked against it
- **sorry** (uninformative_gloss): Gloss only restates the headword, so the composition cannot be checked against it
- **stand** (uninformative_gloss): Gloss only restates the headword, so the composition cannot be checked against it
- **staying** (uninformative_gloss): Gloss only restates the headword, so the composition cannot be checked against it
- **still_raw** (uninformative_gloss): Gloss only restates the headword, so the composition cannot be checked against it
- **sun** (tree_mismatch): Preferred tree differs from reference demo tree (advisory)
  - expected: `source+light+hot`
  - live: `sky+fire`
- **thought** (tree_mismatch): Preferred tree differs from reference demo tree (advisory)
  - expected: `think+inside`
  - live: `inside+think`
- **trade** (flat_when_hierarchical): Demo depth 2 but preferred uses only primitive roots (allowed)
- **trade** (tree_mismatch): Preferred tree differs from reference demo tree (advisory)
  - expected: `exchange+person`
  - live: `give+take+person`
- **tribe** (flat_when_hierarchical): Demo depth 2 but preferred uses only primitive roots (allowed)
- **tribe** (tree_mismatch): Preferred tree differs from reference demo tree (advisory)
  - expected: `community+bond`
  - live: `collective+person+bond`
- **try** (uninformative_gloss): Gloss only restates the headword, so the composition cannot be checked against it
- **voice** (tree_mismatch): Preferred tree differs from reference demo tree (advisory)
  - expected: `speak+breath`
  - live: `person+speak`
- **war** (flat_when_hierarchical): Demo depth 3 but preferred uses only primitive roots (allowed)
- **war** (tree_mismatch): Preferred tree differs from reference demo tree (advisory)
  - expected: `tribe+conflict`
  - live: `collective+conflict+person`
- **weapon** (flat_when_hierarchical): Demo depth 2 but preferred uses only primitive roots (allowed)
- **weapon** (tree_mismatch): Preferred tree differs from reference demo tree (advisory)
  - expected: `tool+conflict`
  - live: `hand+conflict`
- **what** (uninformative_gloss): Gloss only restates the headword, so the composition cannot be checked against it
- **world** (tree_mismatch): Preferred tree differs from reference demo tree (advisory)
  - expected: `earth+all`
  - live: `earth+life`
- **worried** (uninformative_gloss): Gloss only restates the headword, so the composition cannot be checked against it
### Info

- **null** (playtest_data_ignored): 4257 playtest round(s) on disk were collected against an earlier seed bank and take no part in selection

## Teaching-tree dependency order

- `above` = sky + near
- `acceptance` = still + feel
- `afraid` = fear + body
- `again` = do + around
- `age` = time + body
- `agent` = do + person
- `agree` = same + speak
- `ahead` = front + place
- `almost` = near + far
- `along` = near + path
- `already` = now + before
- `always` = all + time
- `answer` = speak + know
- `apprentice` = person + know + take
- `arm` = hand + body
- `ash` = fire + earth
- `away` = move + far
- `axe` = stone + conflict
- `bag` = take + inside
- `bandage` = skin + hold
- `basket` = plant + inside
- `beach` = water + bound
- `beautiful` = good + see
- `beginning` = one + time
- `behind` = outside + back
- `bellows` = air + fire
- `belong` = inside + bond
- `belongs` = self + inside + collective
- `below` = near + earth
- `beside` = near + bound
- `betray` = bond + bad
- `between` = bound + bound
- `bird` = sky + animal
- `birth` = life + before
- `birthplace` = birth + place [via: birth]
- `blacksmith` = metal + person
- `blame` = speak + bad + person
- `bleeding` = move + pain
- `blind` = see + empty
- `blood` = life + body
- … and 414 more
