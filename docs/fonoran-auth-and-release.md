# Fonoran auth, contributions, and release plan

> **Status:** implemented, Google OAuth for Fonoran write access.

This document covers how to protect live Fonoran vocabulary in production, how contributors apply to help, and what must be true before merging `feature/fonoran-language-experiment` and deploying to [fonora.org](https://fonora.org).

For deployment mechanics, see [deploy.md](deploy.md). For vocabulary model and API surface, see [fonoran.md](fonoran.md).

---

## Goals

| Goal | Approach |
| --- | --- |
| **Fonora script** stays open | Public read + GitHub PRs for `language-rules.md` and encoder changes |
| **Fonoran language** edits are controlled | Google OAuth for builder write access; public read-only dictionary |
| **Contributor intake** | Google Form (Workspace), no in-app form, no admin panel |
| **Admin workflow** | You sign in with Google, use existing builder tabs (Root Creator, Review, etc.) |
| **Open source repo** | Auth middleware and docs in git; secrets and live vocabulary stay out of git |

---

## What we are *not* building

- In-app intake / submission queue
- Separate admin panel or inbox UI
- Custom TOTP / 2FA inside the app (Google Workspace 2-Step Verification covers this)

---

## Authentication (Phase 1: required before production writes)

### Identity provider

**Google Workspace** for `@fonora.org`:

1. Create Workspace org and primary admin account
2. Enable **2-Step Verification** on admin account (mandatory)
3. Create OAuth 2.0 **Web application** credentials in Google Cloud Console
4. Authorized redirect URI: `https://fonora.org/auth/callback` (and `http://localhost:8000/auth/callback` for dev)

### App behavior

```
Public (no login)
  GET  /api/fonoran/*         , lab, dictionary, graph, health, lexicon
  GET  /fonoran/              , lander, dictionary, explorer (read-only UI)

Admin (@fonora.org Google session)
  POST /api/fonoran/*         , create roots, compounds, review, DDA, undo
  PATCH /api/fonoran/*        , edit sounds, compounds, review state
  /fonoran/ builder tabs      , Root Creator, Word Creator, Review, Advanced
```

### Implementation sketch

1. Add session middleware to [`server.js`](../server.js) (httpOnly, Secure, SameSite=Lax cookie)
2. Routes: `GET /auth/google`, `GET /auth/callback`, `POST /auth/logout`, `GET /auth/session`
3. In [`tools/fonoran-api.js`](../tools/fonoran-api.js): allow all **GET**; require valid session for **POST** and **PATCH**
4. Restrict login to `ALLOWED_DOMAIN=fonora.org` or explicit `ADMIN_EMAILS` allowlist
5. In [`fonoran/fonoran-app.js`](../fonoran/fonoran-app.js): show **Sign in with Google** when unauthenticated; hide or disable write controls (server enforcement is authoritative)

### Heroku env vars (new)

| Variable | Purpose |
| --- | --- |
| `GOOGLE_CLIENT_ID` | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `SESSION_SECRET` | Random 32+ byte secret for signing cookies |
| `ALLOWED_DOMAIN` | e.g. `fonora.org`, only `@fonora.org` accounts may write |
| `AUTH_CALLBACK_URL` | Optional override; default derived from request host |

Existing vars unchanged: `DATABASE_URL`, `FONORAN_STORAGE`, etc.

### Dev mode

Without OAuth env vars, local dev can either:

- Stay fully open (document clearly), or
- Use `FONORAN_AUTH=off` explicitly for local builder work

Production must **never** run with writes enabled and no auth when `DATABASE_URL` is set.

---

## Contributor intake (Google Form)

Use a **Google Form** in Workspace (linked from `/fonoran/` lander and [CONTRIBUTING.md](../CONTRIBUTING.md)). Responses go to a Google Sheet; you review manually and enter approved items yourself in the builder.

### Suggested fields

| Field | Type | Required |
| --- | --- | --- |
| First name | Short text | Yes |
| Last name | Short text | Yes |
| Email address | Email | Yes |
| University / institution | Short text | Yes |
| `.edu` email address | Email | Yes (verify affiliation) |
| Role | Multiple choice: **Student (major)** / **Professor** / **Other** | Yes |
| If student: major / field of study | Short text | Conditional |
| If professor: department / title | Short text | Conditional |
| Why do you want to contribute to Fonoran? | Paragraph | Yes |
| What would you like to contribute? | Checkboxes: new roots, compound words, meanings, pronunciation review, documentation, other | Yes |
| Prior conlang or linguistics experience | Paragraph | No |
| Can we contact you at your `.edu` address? | Yes / No | Yes |
| Anything else we should know? | Paragraph | No |

### Form settings

- Collect email addresses (Workspace)
- Limit to one response per Google account (optional)
- Notification email to `you@fonora.org` on each submission
- Do **not** embed Form API keys in the repo, link to the public Form URL only

### Placeholder URL

Replace `FORM_URL_TBD` in docs/UI once the Form is created:

```
https://docs.google.com/forms/d/e/FORM_ID/viewform
```

---

## Open source and repo layout

**Same repo for Fonora + Fonoran is fine.**

| In git (public) | Out of git (private / production) |
| --- | --- |
| Builder UI, API handlers, auth middleware | `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `DATABASE_URL` |
| Reference JSON (`fonoran-gen3-*`, `fonoran-canonical-*`) | Live lab: `data/fonoran-sound-bucket.json` (gitignored) |
| Docs, tests, CLI tools | PostgreSQL rows for production vocabulary |
| Auto-built lexicon source logic | `data/fonoran-english-lexicon.json` (gitignored, built at runtime) |

Security does not depend on hiding code. Attackers cannot write without a valid Google session on an allowlisted account.

**Fonora contributions:** GitHub issues / PRs (existing templates).

**Fonoran contributions:** Google Form → manual review → you add approved items while signed in.

---

## Branch review: `feature/fonoran-language-experiment`

Reviewed against `main` (6 commits, 53 files, ~14.6k lines). **Nothing in the committed history should be removed** for open-source release.

### Clean ✅

- No `.env`, credentials, or connection strings in git history
- `data/fonoran-sound-bucket.json` never committed (gitignored)
- `data/fonoran-english-lexicon.json` never committed (gitignored)
- No personal emails or API keys in tracked files
- `npm test` passes (71/71) on branch
- Reference semantics JSON under `data/` is intentional public reference data, not live vocabulary

### Committed data (intentional)

| File | Role |
| --- | --- |
| `fonoran-gen3-*.json` | DDA reference inventory for inference and English picker |
| `fonoran-canonical-*.json` | Canonical primitive registry (generator / audit reference) |
| `fonoran-stress-test-concepts.json` | Offline stress-test fixture |

Live vocabulary on production lives in **PostgreSQL** (or local gitignored JSON), not in these files.

### Blockers before production deploy ⚠️

1. **Unauthenticated write API**: all `POST`/`PATCH` routes in `fonoran-api.js` are open today. Do **not** deploy with `DATABASE_URL` until Phase 1 auth ships (or temporarily disable mutating routes).
2. **Dangerous ops exposed**: `POST /api/fonoran/lab/seed`, `reset-review`, and `undo` must require admin session.
3. **CI**: GitHub Actions runs on PR to `main`; open PR to validate CI on this branch.

### Safe to merge to `main` for open source? 

**Yes for the codebase**, with this caveat documented in README/deploy:

- Merging public **read** features (dictionary, lander, docs, reference data) is safe
- Production **write** access must stay disabled or auth-gated before pointing `DATABASE_URL` at live data

Optional follow-up (not blockers for merge):

- Link Google Form from Fonoran lander once URL exists
- Add `FONORAN_WRITES=off` env kill-switch for emergency read-only mode
- GitHub issue template mirroring Form fields (alternative to Form for open-source-native intake)

---

## Release checklist

### Pre-merge (open source)

- [ ] Open PR from `feature/fonoran-language-experiment` → `main`
- [ ] CI green on PR
- [ ] Confirm `.gitignore` still excludes runtime bucket + lexicon
- [ ] Update CONTRIBUTING with Fonora vs Fonoran contribution paths
- [ ] Create Google Form; replace `FORM_URL_TBD` in docs and lander

### Pre-production deploy

- [ ] Google Workspace live; admin 2FA enabled
- [ ] OAuth credentials created; redirect URIs configured
- [ ] Phase 1 auth merged and deployed
- [ ] Heroku config: `GOOGLE_*`, `SESSION_SECRET`, `ALLOWED_DOMAIN`, `DATABASE_URL`
- [ ] Smoke test: unsigned user can browse dictionary; cannot POST root
- [ ] Signed-in `@fonora.org` user can create and approve words
- [ ] Export backup: `npm run fonoran:export` after deploy

### Post-deploy

- [ ] `/fonoran/` lander links to Google Form
- [ ] `GET /health` monitored
- [ ] Document auth troubleshooting in [deploy.md](deploy.md)

---

## Implementation order

1. **Google Workspace**: email + OAuth app + Form
2. **Auth middleware**: session + write protection on API
3. **Builder login UX**: sign in button, hide writes when logged out
4. **Merge to `main`**: open source release
5. **Production deploy**: with Postgres + auth env vars
6. **Form link**: on lander and CONTRIBUTING

---

## Related docs

- [platform-overview.md](platform-overview.md), three-layer architecture
- [fonoran.md](fonoran.md), vocabulary model and API
- [deploy.md](deploy.md), Heroku, PostgreSQL, production checklist
- [CONTRIBUTING.md](../CONTRIBUTING.md), contribution paths
