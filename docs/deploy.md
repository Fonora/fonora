# Deployment

Fonora is a **browser-based single-page app** with WASM dependencies. It is not a traditional API backend, but it **does need an HTTP server** in production, not because of server-side logic, but because:

- ES modules (`import`) require HTTP(S)
- `fetch('docs/language-rules.md')` must be served with correct MIME types
- eSpeak NG, ONNX Runtime, and Piper load `.wasm` and `.data` assets
- Opening `index.html` directly (`file://`) is unsupported

The included [`server.js`](../server.js) is a small static file server. Heroku, Railway, Fly.io, or any Node host can run `npm start`.

## Heroku (recommended)

### Prerequisites

- [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli)
- GitHub repo pushed to `github.com/jamesc137/fonora` (or your fork)
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
| `DATABASE_URL` | - | PostgreSQL connection string for Fonoran lab data |
| `FONORAN_STORAGE` | `postgres` if `DATABASE_URL` set, else `json` | Force `json` or `postgres` storage |
| `FONORAN_SKIP_JSON_MIRROR` | - | Set to `1` to skip writing JSON mirror when using PostgreSQL |
| `PGSSLMODE` | - | Set to `disable` for local PostgreSQL without SSL |
| `GOOGLE_CLIENT_ID` | - | Google OAuth client ID (Fonoran write auth) |
| `GOOGLE_CLIENT_SECRET` | - | Google OAuth client secret |
| `SESSION_SECRET` | - | Random secret for signing session cookies (32+ chars) |
| `ALLOWED_DOMAIN` | `fonora.org` | Only `@domain` Google accounts may edit Fonoran |
| `ADMIN_EMAILS` | - | Optional comma-separated allowlist instead of domain |
| `AUTH_CALLBACK_URL` | derived from request | OAuth redirect URI override |
| `FONORAN_AUTH` | - | Set to `off` to disable auth locally |

No secrets are required for the **public script app** alone. When all three OAuth vars are set (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`), Fonoran **write** routes require a signed-in `@fonora.org` Google account. Copy [`.env.example`](../.env.example) for local testing.

## PostgreSQL (Fonoran lab data)

Live Fonoran vocabulary (roots, compounds, review state) can be stored in **PostgreSQL** instead of `data/fonoran-sound-bucket.json`.

### Heroku Postgres

```bash
heroku addons:create heroku-postgresql:essential-0
heroku config:get DATABASE_URL
```

On first boot with an empty database, the server **imports** local `data/fonoran-sound-bucket.json` if present, your JSON file is **not deleted**.

### Manual import / export

```bash
# Import local JSON → PostgreSQL (requires DATABASE_URL)
npm run fonoran:import

# Export PostgreSQL → JSON backup
npm run fonoran:export
```

### Local development

Without `DATABASE_URL`, storage falls back to JSON at `data/fonoran-sound-bucket.json` (gitignored). Reference generator JSON (Gen 3 configs, canonical registry) remains file-based.

See [platform-overview.md](platform-overview.md) for the data architecture overview.

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
- [ ] `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `ALLOWED_DOMAIN` set on Heroku
- [ ] Write API requires `@fonora.org` session; unsigned users can browse dictionary only
- [ ] `DATABASE_URL` set; live bucket imported or seeded once
- [ ] Contributor Google Form linked from `/fonoran/` lander
- [ ] Backup: `npm run fonoran:export` after significant changes

## CI

GitHub Actions runs `npm test` on push/PR, see [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).
