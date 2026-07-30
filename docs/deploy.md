# Deployment
> **Operations doc.** How Fonora is deployed and where each kind of data lives.


Fonora is a **browser-based single-page app** with WASM dependencies. It is not a traditional API backend, but it **does need an HTTP server** in production, not because of server-side logic, but because:

- ES modules (`import`) require HTTP(S)
- `fetch('docs/language-rules.md')` must be served with correct MIME types
- eSpeak NG, ONNX Runtime, and Piper load `.wasm` and `.data` assets
- Opening `index.html` directly (`file://`) is unsupported

The included [`server.js`](../server.js) is a small static file server. Heroku, Railway, Fly.io, or any Node host can run `npm start`.

## Heroku (recommended)

### Prerequisites

- [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli)
- GitHub repo pushed to `github.com/Fonora/fonora` (or your fork)
- Domain `fonora.org` configured in Heroku + DNS

### Deploy

```bash
heroku login
heroku create fonora   # or link an existing app
heroku buildpacks:set heroku/nodejs
git push heroku main
```

The [`Procfile`](../Procfile) runs `web: npm start`. Heroku sets `$PORT`; the server binds to `0.0.0.0`.

### Build

`npm install` runs `postinstall`, which copies WASM bundles into `vendor/`:

- `vendor/espeak-ng/`, IPA pipeline
- `vendor/espeak-audio/`, Reader audio playback
- `vendor/onnx/`, Piper neural TTS (copied from `onnxruntime-web@1.20.x`, must match `piper-tts-web`)
- `vendor/piper-tts-web/`, Piper browser bundle

`node_modules/` is also present on Heroku; the server falls back to `node_modules/` when `vendor/` copies are missing (see `URL_ALIASES` in [`server.js`](../server.js)). The browser also falls back to unpkg for ONNX WASM if `/vendor/onnx/` returns 404.

### Custom domain

```bash
heroku domains:add fonora.org
heroku domains:add www.fonora.org
```

Point DNS (registrar) to the Heroku DNS targets shown by `heroku domains`. Enable automatic HTTPS in the Heroku dashboard.

### Health check

```
GET /health → 200 ok
```

Use for uptime monitors.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8000` | HTTP port (set by Heroku) |
| `HOST` | `0.0.0.0` | Bind address |
| `DATABASE_URL` | - | PostgreSQL connection string for user data. The language does not use it. |
| `FONORAN_STORAGE` | `postgres` if `DATABASE_URL` set, else `json` | Force user data to `json` or `postgres` |
| `PGSSLMODE` | - | Set to `disable` for local PostgreSQL without SSL |
| `GOOGLE_CLIENT_ID` | - | Google OAuth client ID (Fonoran write auth) |
| `GOOGLE_CLIENT_SECRET` | - | Google OAuth client secret |
| `SESSION_SECRET` | - | Random secret for signing session cookies (32+ chars) |
| `ALLOWED_DOMAIN` | - | **Legacy** — no longer restricts community sign-in. Use `ADMIN_EMAILS` for admin-tier access. |
| `ADMIN_EMAILS` | - | Comma-separated allowlist of Google emails with full admin write access |
| `AUTH_CALLBACK_URL` | derived from request | OAuth redirect URI override |
| `FONORAN_AUTH` | omit in production | Opt-out only: set to `off` locally to disable auth when OAuth is configured |

No secrets are required for the **public script app** alone. When all three OAuth vars are set (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`), Fonoran uses a two-tier auth model: any signed-in Google user may vote and submit proposals (community tier); admin writes require an email in `ADMIN_EMAILS`. Omit `FONORAN_AUTH` in production; it is an opt-out flag only (`off` disables auth for local builder work). Copy [`.env.example`](../.env.example) for local testing. See [fonoran-auth-and-release.md](fonoran-auth-and-release.md) for the full tier breakdown.

## PostgreSQL (Fonoran storage)

All **runtime Fonoran lab state** lives in **PostgreSQL** when `DATABASE_URL` is set:

```mermaid
flowchart TB
  subgraph browser [Browser]
    SPA["SPA /language · /learn · /tools"]
  end
  subgraph server [server.js]
    API["/api/fonoran/*"]
    OAuth["OAuth session"]
    Static["Static files + WASM"]
  end
  subgraph postgres [PostgreSQL — user data only]
    Community["Accounts · lesson progress\ncommunity proposals · votes"]
  end
  subgraph gitSeeds [Git — the language]
    DataJSON["data/*.json\nroots · compound recipes · inventory\nword banks · proposal queue"]
  end
  subgraph fonoraData [fonora-data submodule]
    Cache["Gap reports · test snapshots\nstranger corpus"]
  end
  SPA --> API
  SPA --> Static
  API -->|"read + write"| postgres
  API -->|"read only on a deployed host"| gitSeeds
  API --> fonoraData
```

**In PostgreSQL:** accounts, lesson progress, community proposals, votes. State a person creates by using the site.

**In git, under `data/`:** the language. Roots, compound recipes, the concept inventory, the English word banks, and the review queue. The server reads these files; it does not copy them into a database first.

**In the fonora-data submodule** (via `FONORAN_DATA_DIR` / `external/fonora-data`): the phrase corpus, gap reports, and test snapshots. Generated artifacts.

### The language cannot be edited on a deployed host

A dyno filesystem does not survive a restart, so a Word Manager edit made against production would be lost. This is deliberate. The language is edited in a checkout, reviewed as a diff, and shipped as a deploy, which is what makes the deployed site show exactly what the repository says.

It used to work the other way: production wrote the language to Postgres and skipped the file mirror, so the live lexicon existed only in a database and never in git. That arrangement caused a silent failure where a batch of accepted compounds was written to `data/fonoran-compounds.json` while the build read the database copy, and the run reported success having changed nothing.

Backups follow from this: the language is backed up by git. Only user data needs a database backup, which Heroku Postgres provides.

### Heroku Postgres

```bash
heroku addons:create heroku-postgresql:essential-0
heroku config:get DATABASE_URL
```

The four user tables are created on first boot. Nothing needs seeding.

### Local development

Without `DATABASE_URL`, user data falls back to `data/fonoran-community.json`. The language reads from the seed files either way, so a local checkout with no database is fully functional apart from sign-in.

**External generated data:** the phrase corpus, gap reports, and test snapshots live in [Fonora/fonora-data](https://github.com/Fonora/fonora-data), checked out as `external/fonora-data` (git submodule). After clone:

```bash
git submodule update --init
npm run fonoran:data:status
```

Optional `.env`: `FONORAN_DATA_DIR=external/fonora-data`. The main repo pins the data version in `data/fonora-data.manifest.json`.

**Heroku:** GitHub deploy does not checkout git submodules. `postinstall` and the `release:` phase run `scripts/fonoran-data-fetch.js`, which downloads the pinned commit from GitHub into `external/fonora-data` (no `git` required on the dyno). Set `FONORAN_DATA_DIR=external/fonora-data` on Heroku.

See [platform-overview.md](platform-overview.md) for the data architecture overview.

**Fonoran vocabulary pipeline (optimize → build → Heroku):** [fonoran-compound-workflow.md](fonoran-compound-workflow.md). On Heroku after deploy, use **Advanced → Regenerate dictionary from git seeds** at `/tools#advanced` (admin sign-in required).

## Static hosting alternatives

Platforms like **Netlify**, **Cloudflare Pages**, or **GitHub Pages** can host the files, but you must:

1. Run `npm install` in CI to populate `vendor/`
2. Publish `index.html`, `app.css`, `js/`, `docs/`, `vendor/`
3. Configure WASM MIME type (`application/wasm`)
4. Ensure ES module paths resolve (no bundler today)

Because WASM assets are large (~90 MB in `vendor/` after install), a Node static server on Heroku is the simplest path that matches local development.

## Production checklist

### Fonora (script app)

- [ ] `npm install && npm test` pass
- [ ] `npm start`, Translator, Reader, and Sound Grid work
- [ ] `https://fonora.org` serves with valid TLS
- [ ] Canonical URL and Open Graph tags point to `https://fonora.org/` (see `index.html`)
- [ ] Custom domain redirects `www` → apex or vice versa (your preference)

### Fonoran (language builder)

- [ ] Google Workspace + OAuth credentials configured ([fonoran-auth-and-release.md](fonoran-auth-and-release.md))
- [ ] `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `ADMIN_EMAILS` set on Heroku
- [ ] `FONORAN_AUTH` omitted in production (opt-out only; do not set to `off` on Heroku)
- [ ] Community users can vote/propose; admin writes require a listed `ADMIN_EMAILS` session
- [ ] `DATABASE_URL` set on Heroku (user data only; the language ships in the slug)
- [ ] Verify dictionary via `GET /api/fonoran/lab/compounds` (run `npm run fonoran:compound-audit` for live count)
- [ ] Contributor Google Form linked from `/language/` lander
- [ ] Periodic backup of user data via Heroku Postgres backups. The language is backed up by git.

## CI

GitHub Actions runs `npm test` on push/PR, see [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).
