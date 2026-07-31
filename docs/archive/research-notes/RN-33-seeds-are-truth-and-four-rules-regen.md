---
status: Active
date: 2026-07-18
phase: phase-5
---

# Seeds are truth and four-rules preferred regeneration

## Research Question

[RN-30](/research/notes/synthetic-only-llm-validity) and [RN-31](/research/notes/phonetic-seeds-pipeline-readiness) established that LLM intuition ranks seed candidates and that phonetic rules must apply at the seed layer. In practice two further authority problems remained:

1. **Lab drift.** Word Manager and Postgres lab edits could change compounds without writing `data/fonoran-compounds.json`. Git stopped being the editorial source of truth; deploys rebuilt from stale seeds.
2. **LLM preference authority.** Preferred-form promotion still treated LLM consensus as a first-class selector. That conflicted with the Constitution: preferred compounds should follow the four rules (universal phonetics, audible distinction, lego recoverability ≤4 roots, no double consonants), with humans and playtests as the only overrides.

The Constitution itself had also grown past one page, mixing hypothesis, rationale, and workflow into a document agents and contributors could not keep as a single authority check.

**Can Fonoran make editorial JSON the sole source of truth for preferred compounds, cap primitives at 150 via explicit root rings, and regenerate preferred forms with a deterministic four-rules scorer so LLMs advise but never invent or own preferred spellings?**

## Hypothesis

1. **Seeds are truth.** Every durable Word Manager save must sync into `data/fonoran-compounds.json` (and related inventory/roots). The runtime lab (JSON bucket or Postgres) is a rebuild target, not the editorial ledger.
2. **Root rings replace open-ended primitives.** Ring 1 (~50), Ring 2 (100 cumulative), Ring 3 (150 cumulative max) are the only places new primitives may enter. Everything else is compound-only.
3. **Four-rules regen replaces LLM preferred selection.** `npm run fonoran:regen:four-rules` ranks `ASSOCIATION_SEEDS` and current preferred rows by campfire recoverability, understandability heuristics, flattened length ≤4, phonetic ease, and boundary quality. Human / playtest / locked rows stay locked. No LLM calls on the default path.
4. **Doc hierarchy enables enforcement.** A one-page Constitution plus Philosophy / Grammar / Workflow / agent guide (`CLAUDE.md`) keeps the four rules from scattering into research notes and prompts.

## Approach

### Constitution slim + agent guide

Split the founding document into a one-page Constitution and a separate Philosophy deep-read:

| Doc | Role |
| --- | --- |
| [`docs/fonoran-constitution.md`](../fonoran-constitution.md) | Hypothesis, four rules, rings, grammar skeleton, seeds-are-truth |
| [`docs/fonoran-philosophy.md`](../fonoran-philosophy.md) | Why / playtest authority / campfire rationale |
| [`CLAUDE.md`](../../CLAUDE.md) | Agent instructions: seeds are truth; LLMs advise, not invent; version bumps |

### Root rings (`data/fonoran-root-rings.json`)

Canonical Ring 1 / 2 / 3 concept id lists with hard caps (50 / 100 / 150 cumulative). Apply with `npm run fonoran:root-rings:apply`. Experience tiers were rewritten around rings; seed inventory and approved roots realigned.

**Frozen inventory at ship:** 135 primitives (50 + 50 + 35). The 150 cap is a ceiling, not a fill quota.

### Editorial sync (seeds are truth)

[`tools/fonoran-editorial-sync.js`](../tools/fonoran-editorial-sync.js) maps lab compound component recipes back to concept-id compositions and upserts preferred rows in `data/fonoran-compounds.json`. Word Manager publish flows and prune/iterate CLIs keep the git seed bank current. LLM output is guarded so bulk invent paths cannot silently mint preferred forms.

### Four-rules regeneration

[`tools/fonoran-regen-four-rules.js`](../tools/fonoran-regen-four-rules.js) / `npm run fonoran:regen:four-rules`:

- Prunes shadow compounds that duplicate primitive concept ids.
- Calls `optimizeCompoundInventory()` with `useLlm: false`.
- Force-promotes unlocked rows when a higher four-rules candidate wins.
- Skips `human` / `playtest` / editorially locked preferred rows.

[`tools/fonoran-preferred-select.js`](../tools/fonoran-preferred-select.js) ranking order (deterministic path): campfire pass first, then understandability / flattened length / boundary quality; LLM aggregates only when explicitly opted in.

Weird `ASSOCIATION_SEEDS` compositions (e.g. law / government / money style opacity) were rewritten toward recoverable campfire strategies. Golden translation tests refreshed after the preferred-form pass.

Default editorial loop ([`docs/fonoran-compound-workflow.md`](../fonoran-compound-workflow.md)):

```bash
npm run fonoran:regen:four-rules -- --dry-run
npm run fonoran:regen:four-rules -- --apply
npm run fonoran:build:approved
```

## Evaluation

| Gate | Result (post four-rules apply, July 2026) |
| --- | --- |
| Seed-quality gate | **99.3%** pass (448 / 451); **0 failures**; 3 warnings (`again`, `boat`, `break`) |
| Phonetic seed purity | Pass (`dirty_seeds: []`) |
| Preferred authority mix | **397** heuristic · **54** playtest · **1** human · **0** `llm_consensus` as live preferred source |
| Primitive count vs cap | **135 / 150** (rings frozen; headroom for 15 more primitives) |
| Compound inventory | **452** non-rejected editorial compounds |

The seed-quality audit (`data/fonoran-seed-quality-audit.json`) is the automated gate. Human playtests remain constitutional authority when they exist; four-rules regen never overwrites those locks.

## Findings

1. **LLM preference authority was the wrong layer.** Once phonetic purity and campfire scoring live at the seed layer, LLM consensus adds cost and opacity without owning the preferred form. LLMs remain useful for gap proposals and translation frames; they are not preferred-form validators.

2. **Lab-only edits are silent data loss.** Without editorial sync, a Word Manager save that looked successful on production Postgres vanished on the next seed rebuild. Seeds-are-truth closes that loop: edit → write `data/*.json` → build → commit → deploy → regenerate on production.

3. **Rings make the 150 cap operational.** Experience tiers alone did not prevent primitive sprawl. Explicit ring lists plus `fonoran:root-rings:apply` give a single place to freeze communicative core vs compound-only growth.

4. **A one-page Constitution is an enforcement tool.** Agents and contributors were scattering the four rules into prompts and research notes. Pointing every workflow doc at the Constitution plus `CLAUDE.md` reduces contradictory instructions.

5. **Deterministic regen still needs seed craft.** Four-rules scoring cannot rescue opaque seed banks. Rewriting bad `ASSOCIATION_SEEDS` (law, money, government, and similar) mattered as much as the scorer itself.

## What Changed

| Area | Change |
| --- | --- |
| Docs | Constitution slimmed to one page; Philosophy extracted; `CLAUDE.md` agent guide |
| Roots | `data/fonoran-root-rings.json` + `npm run fonoran:root-rings:apply`; package patch bump for editorial seeds |
| Editorial | `tools/fonoran-editorial-sync.js`; Word Manager publish / prune / iterate; LLM output guard |
| Preferred forms | `tools/fonoran-regen-four-rules.js`; `useLlm: false` default in preferred select; seed rewrites; golden corpus refresh |
| Workflow | Compound workflow and CLI docs default to four-rules regen before build |

**Related commits (2026-07-18):**

- `fe1f023` docs: slim Constitution; Philosophy + agent guide
- `e5cd6e1` feat: root rings with 150-primitive cap (v0.1.1)
- `cdcc198` feat: seeds-are-truth editorial sync and Word Manager publish
- `0ce6b23` feat: deterministic four-rules compound regeneration

## Open Questions

- Do the three remaining seed-quality warnings (`again`, `boat`, `break`) need human-authored preferred forms, or can alternate seeds clear the gate without playtests?
- Should production deploys refuse to start (or warn loudly) when Postgres lab compounds diverge from git editorial hashes?
- Ring 3 still has 15 primitive slots. What campfire evidence justifies filling them versus staying compound-only?
- How should translator multi-sentence surfaces expose sentence boundaries (periods) for literary / marketing passages without contradicting Rule 3 (Fonoran writing carries `?` but not English-style period grammar)?

## References

- [RN-12 · The campfire test](/research/notes/the-campfire-test-communication-over-correctness)
- [RN-13 · Concepts are canonical, sounds are editorial proposals](/research/notes/concepts-are-canonical-sounds-are-editorial-proposals)
- [RN-30 · Synthetic-only LLM validity](/research/notes/synthetic-only-llm-validity)
- [RN-31 · Phonetic seeds and pipeline readiness](/research/notes/phonetic-seeds-pipeline-readiness)
- [RN-32 · The Fonoran phonetic constitution](/research/notes/fonoran-phonetic-constitution)
- [fonoran-constitution.md](../fonoran-constitution.md)
- [fonoran-philosophy.md](../fonoran-philosophy.md)
- [fonoran-compound-workflow.md](../fonoran-compound-workflow.md)
- [`tools/fonoran-editorial-sync.js`](../tools/fonoran-editorial-sync.js)
- [`tools/fonoran-regen-four-rules.js`](../tools/fonoran-regen-four-rules.js)
- [`tools/fonoran-preferred-select.js`](../tools/fonoran-preferred-select.js)
- [`data/fonoran-root-rings.json`](../data/fonoran-root-rings.json)
