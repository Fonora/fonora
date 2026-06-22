# Deployment

Fonora is a **browser-based single-page app** with WASM dependencies. It is not a traditional API backend, but it **does need an HTTP server** in production — not because of server-side logic, but because:

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

- `vendor/espeak-ng/` — IPA pipeline
- `vendor/espeak-audio/` — Reader audio playback
- `vendor/onnx/` — Piper neural TTS (copied from `onnxruntime-web@1.20.x`, must match `piper-tts-web`)
- `vendor/piper-tts-web/` — Piper browser bundle

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

No secrets are required for the public site.

## Static hosting alternatives

Platforms like **Netlify**, **Cloudflare Pages**, or **GitHub Pages** can host the files, but you must:

1. Run `npm install` in CI to populate `vendor/`
2. Publish `index.html`, `app.css`, `js/`, `docs/`, `vendor/`
3. Configure WASM MIME type (`application/wasm`)
4. Ensure ES module paths resolve (no bundler today)

Because WASM assets are large (~90 MB in `vendor/` after install), a Node static server on Heroku is the simplest path that matches local development.

## Production checklist

- [ ] `npm install && npm test` pass
- [ ] `npm start` — Translator, Reader, and Sound Grid work
- [ ] `https://fonora.org` serves with valid TLS
- [ ] Canonical URL and Open Graph tags point to `https://fonora.org/` (see `index.html`)
- [ ] Custom domain redirects `www` → apex or vice versa (your preference)

## CI

GitHub Actions runs `npm test` on push/PR — see [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).
