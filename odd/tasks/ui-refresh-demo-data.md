# Feature: UI refresh + demo data + expiring-medicines hero

## Objective
1. Opt-in demo data for production (`SEED_DEMO=true`).
2. Visual refresh inspired by CRM sales dashboards (soft gray background, white rounded cards, red brand accent, polished sidebar/topbar, KPI cards, status pills).
3. A prominent "Próximos a vencer" section at the top of the dashboard landing.

## Constraints
- Single-user pharmacy app; UI copy in Spanish (es-AR, DD/MM/AAAA), code/comments in English.
- Public repo: never commit secrets; nothing is run against production by the agent.
- Demo stock must go through application services (append-only movements, lot-derived stock).
- TDD: off (source: no project configuration; see farmacia-cabaleiro.md). Runners: Vitest, Playwright.
- Delivery: one PR per task from `main`, work-unit Conventional Commits, merge authorized by the user.

## Tasks
- [x] U1 Demo data seed (`prisma/seed-demo.ts`, gated by `SEED_DEMO=true`, idempotent via `DEMO-` products) — PR 1 `feat/demo-data`
- [x] U2 UI refresh via design tokens, app shell and shared ui components — PR 2 `feat/ui-refresh`
- [x] U3 Expiring-medicines hero on dashboard — PR 2 (same branch, separate commit)

## Routes
- U1: delegated direct (single writer agent; mapping done inline over services' composition files).

## Progress / Evidence
- U1: ran `SEED_DEMO=true pnpm db:seed` twice against the dev DB. Run 1: "Demo data loaded: 3 suppliers, 19 products, 25 lots, 4 deliveries". Run 2: "Demo data already present (DEMO- products found), skipping."
- U1 checks: pnpm lint: clean; pnpm typecheck: clean; pnpm test: 42 files / 302 tests passed; pnpm build: success.
- U1 merged: PR #20, merge commit 05ae72a.
- U2: red-600 primary + soft status tokens in globals.css (light only; project has no dark theme values), card/button/badge/table restyle, sidebar with brand/red active pill/user block, top bar (section title, greeting, search to /productos?q=, bell), KPI cards with tinted icon circles. U2+U3 route: inline (shared UI components; mapped 10 files).
- U3: `expiringLots` read (lots with stock, expired or within 30 days = critical window, expiry asc, 8 items + total), pure domain mapper + unit test (4 tests), integration test in tests/integration/dashboard.test.ts (passes against dev DB). "Ver todos" -> /lotes?expiryTo=<today+30>&withStock=1. Red for expired or <=7 days, amber otherwise.
- U2/U3 checks: pnpm lint clean; pnpm typecheck clean; pnpm test 43 files / 306 tests passed; dashboard integration file 2/2 passed; pnpm build compiled successfully. Not visually verified in a browser; no e2e run.
