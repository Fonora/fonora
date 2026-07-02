# Security Policy

## Supported versions

Security fixes apply to the latest release on the `main` branch of [github.com/jamesc137/fonora](https://github.com/jamesc137/fonora).

## Reporting a vulnerability

If you discover a security issue, please **do not** open a public GitHub issue with exploit details.

Instead, email the maintainers or open a private security advisory on GitHub if you have access. Include steps to reproduce and the component affected (auth, API, storage, etc.).

## Secrets and credentials

- Never commit `.env`, OAuth secrets, `SESSION_SECRET`, or `DATABASE_URL`.
- Production secrets belong in Heroku config vars (or your host's secret store) only.
- The repository ships [`.env.example`](.env.example) with empty placeholders.

## Authentication model

Fonoran **write** routes (`POST`/`PATCH`/`DELETE` on `/api/fonoran/*` and the research notes editor) require a valid Google OAuth session when these three vars are set:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `SESSION_SECRET`

`FONORAN_AUTH` is an **opt-out** flag only (`off` disables auth for local development). **Omit it in production.** If OAuth credentials are missing, writes are open (development mode only).

Intentionally public endpoints (research participation):

- `POST /api/fonoran/puzzle/guess` — puzzle conversation playtests (appends to shared playtest store)
- `POST /api/fonoran/expressions/candidates` — compound candidate exploration (compute-only)
- `POST /api/fonoran/translate` — read-only translation (no vocabulary mutation)
- `POST /api/fonoran/lab/graph/preview` — graph preview (compute-only)
- `POST /api/fonoran/snapshot/preview` — parse uploaded snapshot zip without restoring
- `POST /api/fonoran/translation-tests/run` — regenerates `data/fonoran-translation-test-latest.json` (shared metrics file)

See [docs/deploy.md](docs/deploy.md) and [docs/fonoran-auth-and-release.md](docs/fonoran-auth-and-release.md) for the full checklist.

## Local auth opt-out

Set `FONORAN_AUTH=off` or `FONORAN_AUTH_OFF=1` only on a trusted development machine. Both disable write auth even when OAuth credentials are configured.

## Data in git vs production

| In git (public) | Out of git |
| --- | --- |
| Reference JSON, docs, builder UI, auth middleware | Live lab bucket, runtime lexicon, PostgreSQL rows |
| Milestone snapshots (`fonoran-compounds.json`, etc.) | `.env`, local backups |

Security does not depend on hiding source code. Write access requires a valid session on an allowlisted Google account (`ALLOWED_DOMAIN` or `ADMIN_EMAILS`).
