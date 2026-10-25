# Farmacia Cabaleiro

Inventory management web app for Farmacia Cabaleiro: product catalog, lot-based stock with expiry control (FEFO), suppliers and scheduled deliveries, goods receiving, notifications, reports and audit. The UI is in Spanish (es-AR).

## Requirements

- Node.js 24
- pnpm 12
- PostgreSQL (from the database task onward; see `.env.example`)

## Getting started

```bash
pnpm install
cp .env.example .env   # then fill in real values
pnpm dev
```

## Scripts

| Script | Description |
| --- | --- |
| `pnpm dev` | Start the Next.js dev server |
| `pnpm build` / `pnpm start` | Production build and server |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript check (`tsc --noEmit`) |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm test:integration` | Integration tests against the dev database |
| `pnpm test:e2e` | End-to-end tests (Playwright, Chromium) |
| `pnpm push:keys` | Print a fresh VAPID key pair for Web Push |
| `pnpm admin:create` | Create the first admin (`ADMIN_EMAIL`, `ADMIN_NAME`; password prompted, or `ADMIN_PASSWORD` for CI) |

First e2e run needs `pnpm exec playwright install chromium`.

## First admin

After `pnpm db:migrate` and `pnpm db:seed`, create the first administrator:

```bash
ADMIN_EMAIL=you@example.com ADMIN_NAME="Your Name" pnpm admin:create
```

The script refuses to run if a user with that email already exists and never prints secrets.
Password reset links are logged to the server console unless SMTP is configured (`SMTP_*` in `.env`).

## Tests and the shared dev database

`stock_movements` is append-only (a Postgres trigger rejects UPDATE/DELETE), so anything that ever had a movement can never be
deleted. Integration tests therefore run in a transaction that is rolled back; only the concurrency tests commit, using
`TEST-<uuid>` products and a permanent inactive test user (see `docs/architecture.md` section 9). E2E specs create products named
`E2E ...`; those with movements remain in the dev database and the throwaway E2E admin is deactivated instead of deleted.

## Daily alerts

`POST /api/cron/daily` evaluates expiry thresholds, expired lots with stock and upcoming/late deliveries (idempotent: a rerun creates
nothing). It requires `Authorization: Bearer $CRON_SECRET` (503 if `CRON_SECRET` is unset in the app environment).
`.github/workflows/daily-alerts.yml` calls it every day at 08:00 Argentina time; set the repository secrets `APP_URL` and
`CRON_SECRET` (the workflow skips when `APP_URL` is empty). Opening the dashboard also runs it at most once per Argentine day.

## Web Push

Optional. Generate a key pair with `pnpm push:keys` and set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`
(a `mailto:` or `https:` contact) in the app environment; all three are required together. Without them the app keeps working
with in-app alerts only and `/configuracion/notificaciones` says push is not configured. Each user enables push per device
there (the browser asks for permission only after clicking the button). On iPhone/iPad the app must first be installed to the
home screen. Subscriptions answering 404/410 are disabled immediately, and any subscription after 5 consecutive failures.
