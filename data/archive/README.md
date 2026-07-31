# Archived data

Historical experiment outputs and superseded sources kept for provenance only.
Nothing in the repository reads these files; the sources of truth are the
editorial seeds in `data/` (see `CLAUDE.md` and `docs/fonoran-rulebook.md`).

| File | What it was |
| --- | --- |
| `fonoran-gen3-config.json` / `fonoran-gen3-roots.json` | Gen3 DDA root experiment (superseded by Gen3.1) |
| `fonoran-canonical-registry.json` / `fonoran-canonical-roots.json` | Pre-seed "canonical" vocabulary layer, superseded by the editorial seeds |
| `fonoran-primitive-roots.json` | Auto-generated roots report (June 2026), superseded by `fonoran-approved-roots.json` |
| `fonoran-semantic-primitives.json` | Pre-inventory semantic carve; merged into `fonoran-concept-inventory.json` |

Deliberate exception still in `data/`: `fonoran-gen3-1-config.json` and
`fonoran-gen3-1-roots.json` are read by `tools/fonoran-dda-infer.js` (DDA
coordinate inference) and `tools/fonoran-english-roots-build.js`
(`npm run fonoran:roots`), so they stay until those consumers are retired.
