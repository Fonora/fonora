# Research notes — authoring guide

Fonora research notes are markdown files in the repo. Edit the file, commit, deploy. That's it.

**Location:** [`docs/research-notes/RN-XX-slug.md`](research-notes/RN-01-writing-sound-instead-of-spelling.md)

**Canonical example:** [`RN-01-writing-sound-instead-of-spelling.md`](research-notes/RN-01-writing-sound-instead-of-spelling.md)

**Public site:** [`/research`](/research) — server reads the markdown files at startup.

---

## File format

Each note is one file: `RN-<code>-<kebab-title>.md`

Optional YAML frontmatter at the top (status, date, phase):

```yaml
---
status: Active
date: 2026-06-21
phase: phase-1
---
```

| Field | Values |
| --- | --- |
| `status` | Foundational · Active · Superseded · Open (default: Active) |
| `date` | ISO date for timeline ordering (default: git last-commit date on the file) |
| `phase` | phase-1 … phase-5 (default: inferred from RN code) |

Everything else is derived from the markdown body: title from the H1, description from the opening paragraph, related slugs from `/research/notes/...` links.

**No summary line.** Do not add a `> **TL;DR.**` (or similar) blockquote — notes open straight into `## Research Question` in the lab-notebook voice. `npm run research:verify-md` fails if a TL;DR blockquote is present.

---

## Expanded note sections (exact order)

Use exactly these headers, in this order:

1. Research Question
2. Hypothesis
3. Approach
4. Evaluation
5. Findings
6. What Changed
7. Open Questions
8. References

Templates: `NEW_NOTE_TEMPLATE` and `NEW_NOTE_STUB_TEMPLATE` in [`js/research-note-meta.js`](../js/research-note-meta.js).

---

## Verify before merge

```bash
npm run research:verify-md
```

---

## Not used for research notes

- PostgreSQL / `research_notes` table
- Fonora/fonora-data submodule
- Tools → Research Notes editor (deprecated)
- `data/research-notes-store.json` (gitignored legacy editor store)

LLM evaluations and playtests still live in [fonora-data](https://github.com/Fonora/fonora-data) — that is separate from the research notebook.
