# eSpeak NG Integration

Fonora uses [eSpeak NG](https://github.com/espeak-ng/espeak-ng) via the [`espeak-ng`](https://www.npmjs.com/package/espeak-ng) npm package as the canonical pronunciation engine for the IPA pipeline.

## Setup

```bash
npm install
```

The `postinstall` script copies the WASM bundle from `node_modules/espeak-ng/dist/` to `vendor/espeak-ng/` so the static HTTP server can load it without a bundler.

Serve the project over HTTP (not `file://`):

```bash
npm start
```

On Heroku, `npm start` binds to `$PORT` automatically via [`server.js`](../server.js).

## How it works

- Module: [`js/ipa.js`](../js/ipa.js)
- WASM path: `vendor/espeak-ng/espeak-ng.js` + `vendor/espeak-ng/espeak-ng.wasm`
- Singleton: WASM loads once on first use; `initEspeak()` preloads at app startup
- IPA flags: `--ipa=3 --phonout out -q -b=1 -v <voice> <text>`

## Supported languages

| UI code | eSpeak voice |
|---------|--------------|
| `en` | `en-us` |
| `es` | `es` |
| `fr` | `fr-fr` |
| `de` | `de` |
| `ja` | `ja` |
| `ar` | `ar` |
| `zh` | `zh` |

## Size and performance

- First load: ~18 MB (WASM + embedded voice data)
- WASM heap: ~32 MB typical
- Works offline after first download; browser caches assets

## License

eSpeak NG is licensed under **GPL-3.0-or-later**. If you distribute Fonora with the embedded WASM bundle, understand your GPL obligations (source offer, etc.). Fonora’s own encoder and symbol logic remain separate; the GPL applies to the eSpeak NG component.

## Browser compatibility

- Chrome, Firefox, Edge: supported
- Safari (desktop): supported; may be slower on first load
- Mobile Safari: supported but memory-constrained; large WASM may fail on older devices

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Failed to fetch` WASM | Serve over HTTP; confirm `vendor/espeak-ng/` exists after `npm install` |
| Empty IPA output | Check voice code; some scripts need specific voices |
| Slow first translation | Expected; WASM initializes once then caches |
