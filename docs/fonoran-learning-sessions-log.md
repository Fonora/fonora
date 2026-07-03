# Fonoran learning sessions log

> Living log for Phase IV learnability experiments. Feeds [RN-19](/research/notes/first-learner-signal-from-phase-iv-regen) and [RN-20](/research/notes/synthetic-intuition-ranking).

## Session template

| Field | Value |
| --- | --- |
| Date | |
| Tool | Dictionary / Translator / Puzzle / Keyboard |
| Duration | |
| Learner | |
| Goal | |
| Outcome | |
| Failures / repair | |
| Notes | |

---

## Session 1 — Dictionary + Translator (Jul 2026)

| Field | Value |
| --- | --- |
| Date | 2026-07-02 |
| Tool | Dictionary, then Translator |
| Duration | ~5 min browse + 1 sentence |
| Learner | Project author (English L1) |
| Goal | Compile an everyday sentence; notice whether roots cluster teachably |
| Outcome | **Positive.** Sentence compiled cleanly; root onset pattern recognized immediately. |
| Failures / repair | None this session |
| Notes | See RN-19 for full breakdown. |

**Translator input:** *i want to eat food in the city*

**Output:** `mi sak tel telto lekche`

**Dictionary signal:** Words starting with **`ye`** recognized as water-related within ~5 seconds of browsing (`ye` = root *water*).

**Compound transparency:**

- `telto` = `tel` (eat) + `to` (thing) → food
- `lekche` = `lek` (many) + `che` (place) → city

---

## Session 2 — Puzzle Conversation (Jul 2026)

| Field | Value |
| --- | --- |
| Date | 2026-07-02 |
| Tool | Puzzle Conversation |
| Duration | ~54 post-regen rounds |
| Learner | Project author (English L1) |
| Goal | Recovery rate on post-regen compounds; surface UI and semantic issues |
| Outcome | **Strong.** 52/54 recovered (96%). Two failures on first repair pass. |
| Failures / repair | `open` (`kelnan`, guessed *money*); `meaning` (`kuwuhu`, guessed *law*) |
| Notes | [RN-19](/research/notes/first-learner-signal-from-phase-iv-regen) published (Active); compound + UI fixes applied after this session. |

**Post-regen stats:** 54 puzzle rounds recorded Jul 2; 52 recovered on first or repair turn; 2 not recovered.

**UI issues surfaced:**

- Concatenated spellings in challenge/repair (`bakamgu`, `lekba`) — no morpheme boundaries
- Repair/reveal fused spellings with glosses (`lekba = many + person`)
- Nested compounds (e.g. `lokeklemra`, `bahugatku`) showed flat root lists without concept tree vs spelling tree

**Semantic disagreements (recovered in MCQ but weak):**

- `island`: `earth + water` too shallow vs teaching tree `earth + inside + water`
- `fly` / `wind`: same roots, reversed order — "move air" reads as wind
- `teacher`: depth via `knowledge` (know + hold) — kept hierarchical preferred; UI breakdown added

**Fixes applied (this session follow-up):**

- Puzzle: `·` boundary formatting, separated spellings/glosses, two-level nested breakdown
- Compounds: island, fly, meaning, open preferred forms updated; `ASSOCIATION_SEEDS` reordered
- `meaning`: `know + same` preferred (`huho`) — `shared_meaning` spelling collision prevented direct promotion

**Automated smoke (2026-07-02):** All 14 priority concepts present in lab (`npm run fonoran:playtest:baseline`).

---

## Session 4 — LLM-promoted compounds + post-RN-21 core (human validation)

> **Goal:** Validate 22 LLM-promoted preferred forms via Puzzle Conversation. Re-test repair and deixis phrases on the **rebalanced 50-root core** (RN-21). Compare recovery against pre-promotion session (Session 2). Feeds Phase IV (compounds) and Phase V (grammar constitutional audit, RN-24).

**Start the lab:** `npm start` → [Puzzle Conversation](/language#puzzle)

| Field | Value |
| --- | --- |
| Date | _TBD_ |
| Tool | Puzzle Conversation (+ Dictionary spot-checks, Translator repair phrases) |
| Goal | Human recovery on LLM-promoted spellings; repair/deixis on post-RN-21 core |
| Outcome | _pending_ |

**Phase V grammar repair probes (RN-24):**

| Phrase (English) | Fonoran target | Probe |
| --- | --- | --- |
| I don't understand | `mi no cha` (or current compile) | Post-RN-21 **understand** root |
| Where? | `wo zis` → answer with **nam** / **tak** | wh-particle vs lexical **here**/**there** |
| What is that? | `wo vus` + **thing** | **vus** + core **thing** repair loop |
| Only water | `vat ye` (or paraphrase) | Focus particle **vat** campfire fit |

**Priority compound rounds (use concept filter URLs):**

| Concept | Why | URL |
| --- | --- | --- |
| community | Top LLM weight; teaching-tree root | `/language#puzzle?concept=community` |
| river | Promoted to 3-root tree | `/language#puzzle?concept=river` |
| teach | Promoted give+know | `/language#puzzle?concept=teach` |
| island | Promoted earth+inside+water | `/language#puzzle?concept=island` |
| friend | Promoted 3-root form | `/language#puzzle?concept=friend` |
| tool | Calibration split (no promotion) | `/language#puzzle?concept=tool` |
| tribe | Calibration split | `/language#puzzle?concept=tribe` |
| world | Compressed to earth+all (fenmel); v4 LLM weight 0.56; **human playtest needed** | `/language#puzzle?concept=world` |

**Also re-test Translator sentence** after `food` promotion (`eat+thing`):

- Input: *i want to eat food in the city*
- Expected: check whether `telto` still appears for food

**Record:** Rounds auto-save to [`data/fonoran-playtests.json`](../data/fonoran-playtests.json). Note any “recovered but unnatural” cases.

---

## Session 3 — Keyboard / spelling (pending)

| Field | Value |
| --- | --- |
| Date | _TBD_ |
| Tool | Platform spelling drills / Fonora keyboard |
| Goal | Type compounds heard or seen in Sessions 1–2 |

---

## Aggregate metrics (update as sessions complete)

| Metric | Current |
| --- | --- |
| Dictionary sessions | 1 |
| Translator sentences tested | 1 |
| Puzzle rounds recorded (post-regen) | 54 (52 recovered, 2 failed: `open`, `meaning`) |
| LLM intuition rounds (v3) | 2,432 |
| LLM-promoted compounds | 22 (awaiting Session 4 human validation) |
| Phase V grammar repair probes | 4 scripted (awaiting Session 4) |
| RN-21 core validation | Pending (50-root filter `?core=1`) |
| Keyboard sessions | 0 |
| Documented failure cases | 2 (`open` → money; `meaning` → law) |

Playtest store: [`data/fonoran-playtests.json`](../data/fonoran-playtests.json)
