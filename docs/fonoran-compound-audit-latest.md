# Fonoran compound audit

> Generated: 2026-07-02T00:50:25.482Z

## Summary

| Metric | Value |
| --- | --- |
| Live compounds | 111 |
| Demo reference trees | 53 |
| Missing from live | 2 |
| Tree mismatches | 1 |
| Broken dependencies | 0 |
| Tree-aware preferred forms | 27 |
| Seed coverage | 111/111 |
| Empty alternates | 0 |
| Playtested concepts | 3 |

### Findings by severity

- **critical**: 0
- **high**: 12
- **medium**: 0
- **low**: 0

### Phonetic ease

- Communicative-core roots: 50 (avg cost 42.3)
- Core on tertiary onsets: 6
- Extended-core avg cost: 46.1

Tertiary-onset roots:
- `change` → cha (complete)
- `up` → ra (communicative_core)
- `down` → ju (communicative_core)
- `place` → che (extended_core)
- `after` → shu (communicative_core)
- `less` → sha (extended_core)
- `fear` → pe (communicative_core)
- `conflict` → pa (extended_core)
- `pulse` → re (complete)
- `strong` → ru (complete)
- `bone` → je (extended_core)
- `heart` → pu (extended_core)
- `metal` → ja (extended_core)
- `tree` → she (communicative_core)
- `left` → chu (communicative_core)

## Findings

### High

- **after** (core_tertiary_onset): Communicative-core root "shu" uses tertiary onset (sh)
- **book** (flat_when_hierarchical): Demo depth 2 but preferred uses only primitive roots
- **book** (tree_mismatch): Preferred tree differs from semantic foundation
  - expected: `knowledge+thing`
  - live: `thing+know+hold`
- **document** (flat_when_hierarchical): Demo depth 2 but preferred uses only primitive roots
- **down** (core_tertiary_onset): Communicative-core root "ju" uses tertiary onset (j)
- **fear** (core_tertiary_onset): Communicative-core root "pe" uses tertiary onset (p)
- **law** (flat_when_hierarchical): Demo depth 2 but preferred uses only primitive roots
- **left** (core_tertiary_onset): Communicative-core root "chu" uses tertiary onset (ch)
- **religion** (flat_when_hierarchical): Demo depth 2 but preferred uses only primitive roots
- **tree** (core_tertiary_onset): Communicative-core root "she" uses tertiary onset (sh)
- **up** (core_tertiary_onset): Communicative-core root "ra" uses tertiary onset (r)
- **work** (flat_when_hierarchical): Demo depth 2 but preferred uses only primitive roots

## Teaching-tree dependency order

- `community` = collective + person
- `family` = person + bond
- `exchange` = give + take
- `knowledge` = know + hold
- `memory` = know + hold + inside
- `remember` = know + before
- `forget` = know + empty
- `identity` = self + memory [via: memory]
- `useful` = good + use
- `run` = move + fast
- `swim` = move + water
- `fly` = move + air
- `river` = water + flow + path
- `wind` = air + move
- `home` = place + bond
- `friend` = person + bond + good
- `enemy` = person + conflict
- `road` = path + move
- `vehicle` = move + thing
- `food` = eat + thing
- `meal` = food + thing [via: food]
- `lamp` = light + thing
- `tool` = thing + hand + useful [via: useful]
- `breath` = air + flow
- `voice` = speak + breath [via: breath]
- `thought` = think + inside
- `shared_meaning` = collective + know + same
- `tribe` = community + identity [via: community, identity]
- `war` = tribe + conflict [via: tribe]
- `village` = place + community [via: community]
- `language` = speak + shared_meaning [via: shared_meaning]
- `money` = exchange + equal + thing [via: exchange]
- `teacher` = person + knowledge + give [via: knowledge]
- `book` = thing + know + hold
- `document` = mark + thing + know
- `joy` = good + feel
- `music` = speak + pulse + joy [via: joy]
- `government` = community + hold + strong [via: community]
- `law` = bond + collective + still
- `religion` = collective + bond + source
- … and 71 more
