# Legacy Fonoran tooling

These scripts are **not** part of the converged language pipeline. Use `npm run fonoran:build` instead.

| Script | Status | Replacement |
| --- | --- | --- |
| `fonoran-primitive-roots.js` | Deprecated | `fonoran-build.js` + `fonoran-root-candidates.js` |
| `fonoran-primitive-roots-import.js` | Deprecated | `fonoran-build.js` |
| `gen3/fonoran-gen3.js`, `gen3/fonoran-gen3-1.js` | Experimental archive | Converged concept inventory + build |
| `gen3/fonoran-gen3-audit.js`, `gen3/fonoran-gen3-1-compare.js`, `gen3/fonoran-gen3-semantic-audit.js` | Archive reports | Regenerate via npm scripts if needed |
| `gen3/fonoran-gen3-coordinates.js`, `gen3/fonoran-gen3-semantic-integrity.js` | Archive helpers | Used by `fonoran-canonical-stabilization.js` only |
| `fonoran-english-roots-build.js` (in `tools/`) | Auxiliary | `fonoran-english-lexicon.js` (inventory-based) |

**Still active in `tools/` (not legacy):**

- `fonoran-gen3-readability.js` — compound boundary scoring in build and lab
- `fonoran-gen3-distinctiveness.js` — distinctiveness scoring in root editorial workflow

Active workflow: see [docs/fonoran.md](../../docs/fonoran.md#pipeline).

npm scripts for `fonoran:primitive-roots*` exit with a deprecation message. Gen 3 archive scripts remain runnable via `npm run fonoran:gen3*`.
