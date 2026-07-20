# Prefix-safe CV / CVC roots

> Regenerable inventory: [`data/fonoran-prefix-safe-roots.json`](../data/fonoran-prefix-safe-roots.json) · CLI: `npm run fonoran:prefix-safe`

## What “algorithmically approved” means here

Not Word Manager approval. A spelling is **prefix-safe** when it neither prefixes nor is prefixed by any other approved root.

Example failure (cleared in 0.1.6): `da` (sick) prefixed `dak` / `dal` / `dan`… → Health **Learnability** dropped to 0.

Same detector as lab Health `prefix_overlap` in [`tools/fonoran-gen3-readability.js`](../tools/fonoran-gen3-readability.js).

### Exclusivity ≠ semantic ban

This is **prefix-family exclusivity**, not “ban this intuitive concept.” If `dak` (hand) exists, `da` cannot — and vice versa. An editor may *feel* that a short CV is arbitrarily blocked; the conflict is structural (segmentation / audible distinction), and the resolution is to choose which member of the family occupies the slot. See the thought experiment in [RN-35 · CV density and CVC audibility](research-notes/RN-35-cv-density-and-cvc-audibility.md).

## Practical rule

| You want… | Constraint |
| --- | --- |
| A new **CV** root | No existing root may start with that CV (`da` blocks all `da*`) |
| A new **CVC** root | No shorter approved CV may be its prefix (`dak` blocked while `da` exists) |

After Package A (`da→du`, `fe→fa`, `ga→wo`, `ge→su`), the live inventory has **0** prefix pairs. The freed CVs `da` / `fe` / `ga` / `ge` are still **not** free to reuse — their CVC families remain.

## Inventory file

[`data/fonoran-prefix-safe-roots.json`](../data/fonoran-prefix-safe-roots.json) lists:

- `approved_prefix_safe.CV` / `.CVC` — current approved roots that pass the rule
- `approved_prefix_unsafe` — should be empty; CI fails if not
- `pool_available.CV_prefix_safe` / `CVC_prefix_safe` — unused generator-pool forms safe to assign next
- `pool_available.*_blocked` — free forms blocked by specific taken spellings

```bash
npm run fonoran:prefix-safe          # rewrite JSON
npm run fonoran:prefix-safe -- --check   # fail if stale or pairs exist
```

`--check` runs under `npm test`.

## Limits

- Soft gate only in auto-assign today (`fonoran-root-sound-assign.js`); Word Manager edit/approve still needs human care — use this inventory before locking a new short root.
- Editorial English collisions and compound-boundary double-consonants are separate checks.
