# Fonoran grammar — constitutional audit (Phase V)

> Structured audit of the wired particle inventory against [fonoran-constitution.md](fonoran-constitution.md) criteria. Feeds [RN-24 · Grammar under the Constitution](research-notes/RN-24-grammar-under-the-constitution.md). **Status:** pre-implementation review (Jul 2026).

## Audit criteria (from the Constitution)

| Criterion | Question |
| --- | --- |
| **Campfire test** | Would a root-knower plausibly need this marker in week one? |
| **Minimal memorization** | Does it earn a dedicated closed-class slot vs structural or lexical expression? |
| **Recoverable meaning** | Could a stranger guess its role from context + roots alone? |
| **Repair-friendly** | Does the sentence skeleton support clarification without new vocabulary? |
| **Invariant** | Does it stay separate from roots and never inflect? |

**Source inventory:** [`data/fonoran-grammar-particles.json`](../data/fonoran-grammar-particles.json) v2.1 (17 wired forms). Prior engineering rationale: [RN-14](research-notes/RN-14-grammar-as-particles-not-words.md).

---

## Wired particles — per-particle review

| Form | Role | Campfire | Memorization | Recoverability | Verdict | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| **mi** | speaker (I) | High | Earned | High | **Keep** | Only pronominal particle; week-one self-reference |
| **ta** | past | High | Earned | Medium | **Keep** | Wired; grammar doc still "Under Development" — teaching story needed |
| **sa** | future | High | Earned | Medium | **Keep** | Renamed from `na` to avoid collision with **no** (RN-14) |
| _(none)_ | present | — | Zero cost | High | **Keep (zero marker)** | Constitutional default; empty Time slot |
| **no** | negation | High | Earned | High | **Keep** | Composes with **true** / **same** for false / different |
| **ya** | affirmation | Medium | Borderline | Medium | **Keep (for now)** | Repair/dialogue; could be gesture-only in campfire scenario |
| **von** | conditional (if) | Medium | Earned | Medium | **Keep** | Hypothetical planning; hard to lexicalize without **cause** root |
| **wo** | question marker | High | Earned | Medium | **Keep** | Flags interrogative clause; pairs with wh-slot |
| **vus** | what | High | Earned | High | **Keep** | Core repair particle |
| **zas** | who | High | Earned | High | **Keep** | Core repair particle |
| **zes** | when | High | Earned | High | **Keep** | Time deixis is grammatical, not just lexical **now** |
| **zis** | where | High | Earned | High | **Keep** | After RN-21, **here**/**there** are lexical; **zis** asks place relationally |
| **zos** | why | Medium | Borderline | Low | **Review** | Reason often lexical (**because** handled structurally, not as particle) |
| **zus** | how | Medium | Earned | Medium | **Keep** | Manner questions; repair-friendly |
| **vat** | only | Low | Borderline | Low | **Review** | Focus modifier; week-one survival dialogue rarely needs scalar focus |
| **vet** | also | Low | Borderline | Low | **Review** | Same as **vat** |
| **vit** | even | Low | Borderline | Low | **Review** | Same as **vat** |

### Quantifier compositions (not separate particles)

| Pattern | Composition | Verdict | Notes |
| --- | --- | --- | --- |
| nobody / nothing | **no** + **person** / **thing** | **Keep** | Transparent; **thing** promoted in RN-21 |
| everyone / everything | **all** + **person** / **thing** | **Keep** | Lexical **all** + root; no monolithic quantifier roots |
| someone / somebody | **some** + **person** | **Keep** | Lexical **some** remains extended-tier root |

**Memorization budget (wired):** 16 surface forms (**mi**, **ta**, **sa**, **no**, **ya**, **von**, **wo**, 6 wh-forms, 3 focus) + zero present marker.

---

## RN-14 open questions — constitutional disposition

| Open question (RN-14) | Constitutional read | Recommended disposition |
| --- | --- | --- |
| **Possession** (`man's`, *my*) | Week-one need is high; English possessive already tokenized away | **Structural or lexical**, not a new particle yet — test *my X* = **mi** + **X** vs dedicated possessive marker |
| **Comparison** (*more*, *than*) | Low campfire priority | **Defer** — express with roots (**big**, **small**, **same**) until playtest demand |
| **Pronouns beyond mi** | **addressee** now in core (RN-21); **you** resolves lexically | **Keep lexical** — aligns with constitution's root-centric model |
| **English auxiliary patterns** | Coverage-driven additions risk particle bloat | **Structural rewrite** in translator before new particles |
| **Non-English triggers** | Constitution targets cross-linguistic strangers, not English compilation | **Phase V follow-up** — audit trigger leakage after English pass stabilizes |
| **Connectives** (*because*, *therefore*) | Routed to clause structure in RN-14 trim | **Keep structural** — do not reintroduce as particles |
| **Spatial prepositions** | Lexical roots (**inside**, **here**, **near**, …) | **Keep lexical** — confirmed by RN-14 and RN-21 promotions |

---

## Post-RN-21 skeleton re-audit

RN-21 promoted **addressee**, **thing**, **here**, **there**, **understand**, **need**, **food**, and spatial scaffolding into the 50-root core. Implications for grammar:

| Pattern | Before RN-21 | After RN-21 | Particle/lexicon boundary |
| --- | --- | --- | --- |
| *where* → **zis** | wh-particle vs sparse deixis | **here**/**there** lexical in core | **Hold** — **zis** asks; **here**/**there** answer |
| *what* → **vus** | wh-particle | **thing** in core | **Hold** — **vus** + **thing** repair loop is constitutional |
| *who* → **zas** | wh-particle | **addressee** + **person** in core | **Hold** — **mi**/**addressee**/**person** triangle teachable |
| Repair (*I don't understand*) | thin core | **understand**, **need** promoted | **Strengthen** — skeleton should demo repair without new particles |
| Negation + identity | **no** + **true** / **same** | **same** kept as root for grammar | **Hold** |

**No boundary violations found** that require immediate particle additions or removals based on inventory changes alone.

---

## Repair grammar vs puzzle conversation

Constitution § Puzzle conversation requires speakers to try, fail, and clarify. Current skeleton:

```text
Subject · Time · Event · Object · Modifiers
```

| Repair move | Available today | Gap |
| --- | --- | --- |
| "What?" (clarify referent) | **wo** + **vus** + repeat Event | Adequate |
| "Who?" | **wo** + **zas** | Adequate |
| "Where?" | **wo** + **zis**; answer with **here**/**there** | Adequate after RN-21 |
| "I don't understand" | **mi** + **no** + **understand** (lexical) | Adequate after RN-21 |
| "Repeat / say again" | No dedicated particle | **Gap** — candidate lexical **same** + gesture, or future particle |
| "Yes / no" (polarity check) | **ya** / **no** | Adequate |
| Focus narrowing (*only this*) | **vat** + demonstrative lexical | Low priority; **vat**/**vet**/**vit** weakest campfire fit |

---

## Summary recommendations (pre-implementation)

1. **Keep the 17-particle core** for Phase V initial pass — no additions until human playtest on repair dialogues.
2. **Review focus trio** (**vat**, **vet**, **vit**) — lowest campfire scores; candidate demotion to extended teaching or structural paraphrase (*only* = **no** + **other**?).
3. **Review **zos** (why)** — lowest recoverability among wh-set; monitor whether structural clause handling suffices.
4. **Formalize tense teaching** — mark **ta**/**sa** Active in grammar doc once constitutional audit completes; present-as-default is already constitutional.
5. **Possession and comparison** — run campfire thought experiments before assigning particles; prefer transparent root compositions.
6. **Do not expand** for English regression coverage alone — constitution metric is stranger recovery, not corpus percentage.

---

## Next steps

- Human Session 4+ playtests on repair phrases using post-RN-21 core (see [fonoran-learning-sessions-log.md](fonoran-learning-sessions-log.md))
- RN-24 documents hypothesis and experiment design before any inventory or translator changes
- Re-run this audit after grammar mutations with puzzle-conversation recovery data
