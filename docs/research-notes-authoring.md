# Research notes — authoring guide

Fonora research notes are engineering/research notebook entries, not marketing articles. They document how the project evolved: objective, honest, technical where appropriate, readable, no hype, uncertainty included.

**Canonical example:** [`docs/research-notes/RN-01-writing-sound-instead-of-spelling.md`](research-notes/RN-01-writing-sound-instead-of-spelling.md)

**Audience:** curious developers, linguists, conlang creators, writing-system enthusiasts, future contributors.

**Target length (expanded note):** approximately 1,200–2,000 words.

---

## Two forms

| Form | Purpose | Where it lives |
| --- | --- | --- |
| **Stub** | Seed arc: question → hypothesis → constraints → built → happened → next question | New draft in Tools → Research Notes (`NEW_NOTE_STUB_TEMPLATE`) |
| **Expanded** | Long-form RN-01 structure for publication | `data/research-notes-store.json` (live) + optional mirror `docs/research-notes/<CODE>-<kebab-title>.md` |

**Production:** When `DATABASE_URL` is set (Heroku), the server upserts **published** notes from `data/research-notes-store.json` on boot into PostgreSQL. Committing MD mirrors alone does not update the live site. Prod-only drafts created in Tools stay in Postgres until published or removed.

The editor inserts the **long-form** template by default (`NEW_NOTE_TEMPLATE`). Use the **stub** template when you only have the arc and plan to expand later.

Templates are defined in [`js/research-note-meta.js`](../js/research-note-meta.js):

- `NEW_NOTE_STUB_TEMPLATE` — short seed
- `NEW_NOTE_TEMPLATE` / `researchNoteBodyTemplate()` — expanded sections

---

## Expanded note sections (exact order)

Use exactly these headers, in this order (no TL;DR blockquote — summary lives in metadata `abstract`):

1. **Research Question** — central question; chain from the previous note's open questions
2. **Hypothesis** — working hypothesis *at the time*, not hindsight
3. **Approach** — what was built; real files and design decisions only
4. **Evaluation** — how it was tested; say if informal only
5. **Findings** — what worked and didn't; partial/provisional results OK
6. **What Changed** — what survived vs was superseded; cite real following RN codes
7. **Open Questions** — flows into the next note's Research Question
8. **References** — commits, docs, demos, future notes

Optional metadata block at the top (RN-16 style, usually omitted — the published UI supplies metadata):

```markdown
**Date:** Jun 20, 2026 · **Stage:** Foundational · **Project:** Fonora Script · **Status:** Complete
```

---

## Expansion prompt (for Cursor / manual use)

Replace `<SLUG>` with the note slug (e.g. `synthetic-intuition-ranking`).

```
Write the next Fonora Research Note by expanding an existing stub into the same long-form structure used for RN-01 (docs/research-notes/RN-01-writing-sound-instead-of-spelling.md).

Source: draft for slug `<SLUG>` in data/research-notes-store.json (Tools → Research Notes editor), or a stub using NEW_NOTE_STUB_TEMPLATE in js/research-note-meta.js.

Look up code, title, date, status, phase, description, abstract, related, docs, tools, and source in:
- data/research-notes-store.json (search for slug `<SLUG>`)
- js/research-notes.js (RESEARCH_PHASES for phase labels)

This is not a marketing article or blog post. It should read like an engineering/research notebook documenting how the project evolved — objective, honest, technical where appropriate but readable, no hype or grand claims, documenting uncertainty as well as certainty.

Audience: curious developers, linguists, conlang creators, writing system enthusiasts, future contributors.

Length: approximately 1,200–2,000 words.

Before writing:

1. Read the existing stub/draft body in full — it contains the condensed question/hypothesis/constraints/what-we-built/what-happened/next-question arc. Treat it as the seed, not the final word.

2. Read its metadata entry in data/research-notes-store.json to ground scope and cross-links.

3. Read every doc and source file the stub and metadata point to (files under docs/, js/, tools/, data/).

4. Use git log / git show on those files and on commits around the note's date to reconstruct actual reasoning in chronological order. Do not invent motivations, metrics, or implementation details unsupported by repo history.

5. Read the note immediately before it in notebook order (sort by date, then code in the store) and, if expanded, docs/research-notes/ for that prior note, so this note's Research Question and Approach build on what the previous one concluded and left open.

Title: <CODE> — <Title from metadata, refined if needed for standalone read>

Sections (use exactly these headers, in this order):

## Research Question
## Hypothesis
## Approach
## Evaluation
## Findings
## What Changed
## Open Questions
## References

References subsections:
- Related commits (real hashes from git log)
- Documentation (paths from metadata docs array)
- Interactive demo (paths from metadata tools array)
- Future research notes (real codes/titles of following notes in sequence)

Output:
- Update the note body in the Research Notes editor / store, and
- Save mirror copy to docs/research-notes/<CODE>-<kebab-case-title>.md

Match the style, heading structure, and tone of RN-01. Do not use a TL;DR blockquote in the body — use metadata abstract for one-line summary.

After polish (optional): node scripts/polish-research-notes-md.js
```

---

## Metadata (store / editor)

| Field | Values |
| --- | --- |
| `status` | Foundational · Active · Superseded · Open |
| `phase` | phase-1 … phase-4 (see `RESEARCH_PHASES` in js/research-notes.js) |
| `workflow` | draft · published |

Status mapping for prose:

- **Foundational** — early architecture that later notes build on
- **Active** — current line of work or instrument in use
- **Open** — question stated, insufficient evidence yet
- **Superseded** — replaced by a later approach (say which RN)

---

## Polish script

```bash
node scripts/polish-research-notes-md.js
```

Flattens nested Reference lists for the custom renderer and normalizes em dashes. Run after editing files under `docs/research-notes/`.

---

## Related

- [`scripts/research-notes-import-static.js`](../scripts/research-notes-import-static.js) — one-time seed import
- [`data/research-notes-static-seed.json`](../data/research-notes-static-seed.json) — metadata seed backup
- [`docs/fonoran-learning-sessions-log.md`](fonoran-learning-sessions-log.md) — living human session log (feeds Phase IV notes, not a substitute for RN structure)
