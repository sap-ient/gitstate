# web/scripts

## screenshots.mjs

Playwright-based screenshotter that captures the gitstate UI into PNG files.

### Usage

```bash
# From web/
npm run shots
```

The gitstate server must be running first (default `http://localhost:8080`).

### Output destinations

Every captured screenshot is written to **two** locations:

| Destination | Path | Purpose |
|---|---|---|
| Docs | `docs/screenshots/<name>.png` | README and project docs |
| Public | `web/public/shots/<name>.png` | Served as `/shots/*.png` in the Vite app |

The `web/public/shots/` files are served statically at `/shots/<name>.png` by both the Vite dev server and the production build. The landing page `Hero` section uses these via `<BrowserFrame src="/shots/dashboard.png">`.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `BASE_URL` | `http://localhost:8080` | Base URL of the running server |
| `OUT` | `../../docs/screenshots` | Override the docs output directory |
| `EMAIL` | `demo@gitstate.dev` | Login email for authed page shots |
| `PASSWORD` | `demo1234` | Login password for authed page shots |

### Captured pages

**Public (no auth) — dark + light themes:**
- `/` → `landing-dark.png`, `landing-light.png`
- `/pricing` → `pricing.png`, `pricing-light.png`
- `/compare` → `compare.png`
- `/docs` → `docs.png`

**Authed (dark theme):**
- `/dashboard` → `dashboard.png`
- `/board` → `board.png`
- `/involvement` → `involvement.png`
- `/capacity` → `capacity.png`
- `/cycle-time` → `cycle-time.png`
- `/settings/billing` → `billing.png`

Pages fail independently — one broken route won't stop the rest. Override with `BASE_URL`, `OUT`, `EMAIL`, and `PASSWORD` env vars.
