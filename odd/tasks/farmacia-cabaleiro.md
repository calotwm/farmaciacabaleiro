# Feature: Farmacia Cabaleiro — inventory management system

## Objective
Production-ready web app for Farmacia Cabaleiro: product catalog, lot-based inventory with expiry control (FEFO), suppliers and scheduled deliveries, goods receiving, in-app + Web Push notifications, reports, audit.

## Problem / Why
The pharmacy needs to control stock per lot, avoid dispensing expired lots, track supplier deliveries and get automatic alerts. Source: full spec pasted by the user (sections 1–15).

## Scope
Everything in the spec, delivered in 5 stages. UI in Spanish (es-AR), DD/MM/YYYY, ARS default currency, America/Argentina/Buenos_Aires.

## Constraints and accepted decisions
- Stack: Next.js 15 (App Router) + TypeScript, Tailwind + shadcn/ui, Prisma + PostgreSQL 18, Zod, Vitest, Playwright, Docker Compose for production.
- Modular monolith; hexagonal layers per module (`src/modules/<module>/{domain,application,infrastructure}`).
- Own auth: DB sessions, argon2id, httpOnly cookies, RBAC (admin, employee).
- Separate worker process (node-cron) for daily alerts; push failures never roll back business transactions.
- Stock lives in lots; product stock is derived (physical / available / blocked).
- `StockMovement` append-only, enforced by a Postgres trigger.
- Idempotency keys: receipt confirmation and `AlertEvent` (rule + entity + threshold + event date).
- Expiry stored as DATE; instants as timestamptz; "today" computed in America/Argentina/Buenos_Aires.
- Assumptions accepted by user: (1) lot expires at end of stated day, MM/YYYY → last day of month; (2) expired lots only allow write-off/return with reason; (3) no negative stock, no override; (4) corrections via compensating movements, even for admins; (5) single-tenant, no POS integration.
- Dev/test database: Railway project `farmacia-cabaleiro`, Postgres service, public TCP proxy; URL in local `.env` (gitignored).

## TDD
- Mode: off (source: no project/session TDD configuration). Spec-mandated automated tests (section 14) are written alongside each module and run at task closure.
- Runners: Vitest (unit/integration), Playwright (e2e).

## Delivery
- Forecast: far above 400 authored lines → strategy `ask-on-risk`; chain strategy: `stacked-to-main` (user choice, 2026-10-24).
- Each slice branches from `main` (or its parent slice) and must work on its own. No git remote yet; PRs are created once a remote exists.
- Remote: github.com/calotwm/farmaciacabaleiro (public — never commit secrets).
- Slices: PR1 `feat/scaffold` = 95b00b4 (T1.1), merged to main (74a256d). PR2 `feat/data-model` = 07c40d1 (T1.2), merged. PR3 `feat/shared-kernel` = 78376d0 (T1.3). PR4 `feat/auth` = 765181e (T2.1), both merged. PR5 `feat/catalog` = 363565b (T2.2). PR6 `feat/inventory` = 6e9e833 (T2.3). PR7 `feat/stock-counts` = a29ed94 (T2.4).
- Autonomy: user authorized finishing all tasks without review, including merging slice PRs (2026-10-24).
- Cost policy: zero budget. Anything paid is replaced by a free alternative or skipped and documented. Deployment target re-evaluated at T5.4 against this (Railway usage may consume credits).
- RDD: disabled globally by user on 2026-10-24 ("omitilo siempre"). T1.1 candidate declined. No reviews from here on; ordinary checks remain.

## Tasks
### Stage 1 — Architecture and data model
- [x] T1.1 Scaffold Next.js + TS + Tailwind + shadcn/ui, ESLint, Vitest, Playwright, pnpm scripts
- [x] T1.2 Prisma schema for all entities, constraints, indexes; initial migration + append-only trigger; applied to Railway DB
- [x] T1.3 Shared kernel: date/timezone utils (AR), money formatting, Zod env validation; architecture doc (`docs/architecture.md`)

### Stage 2 — Auth, permissions, products, lots, inventory
- [x] T2.1 Auth: login/logout, sessions, password reset, RBAC guards, secure admin bootstrap script, audit log
- [x] T2.2 Catalog: products, categories, units (CRUD, archive, search, barcode input)
- [x] T2.3 Lots + stock movements: entries, exits (FEFO), adjustments, returns, write-offs, blocked/quarantine, expiry status
- [x] T2.4 Physical counts and reconciliation

### Stage 3 — Suppliers, calendar, receiving
- [ ] T3.1 Suppliers CRUD + supplied products
- [ ] T3.2 Scheduled deliveries: calendar + list, reschedule, compliance history
- [ ] T3.3 Receiving flow: from delivery or unscheduled, partial, discrepancies, idempotent atomic confirmation

### Scope cut (2026-10-25, user): single user, keep only what matters, minimize tokens
Rationale: the app is used by one person; the original spec over-engineered it. Already-built auth/RBAC stays as is (no further role work). Dropped: Web Push, separate worker process, notification preferences, charts, Excel export, Docker Compose, extra e2e tests. Tests: focused unit/integration for business rules only.

### Stage 4 — Lean finish
- [ ] T4.1 Dashboard: KPI cards (low stock, out of stock, expiring by threshold, expired with stock, today/next 7 days deliveries, late deliveries) linking to filtered lists + latest movements
- [ ] T4.2 Alerts: idempotent daily check run on demand (on dashboard load, at most once per AR day) for expiry thresholds, expired with stock and late/upcoming deliveries; in-app bell with unread count, mark as read, links. Settings page for expiry thresholds and pharmacy name.
- [ ] T4.3 CSV export: inventory, expiring lots, movements
- [ ] T4.4 Free deployment + short README (install, admin bootstrap, backup with pg_dump)

## Acceptance criteria
Spec sections 1–15; no feature counted done if only its UI exists.

## Progress
- 2026-10-24: Environment inspected; Railway Postgres provisioned and verified (psql connection OK).
- 2026-10-24: T1.1 done, commit 95b00b4, route: delegated (writer trigger, 2+ files). Evidence: lint, typecheck, build pass; test 2/2; e2e 1/1 (writer); parent spot check typecheck + test pass. Risk high (process_boundary in playwright.config.ts) -> review declined.
- 2026-10-24: T1.2 done (delegated, writer trigger). Prisma 7.10.1 + pg adapter, 31 models, migrations init + stock_movement_append_only (trigger + CHECKs) applied to Railway; seed reference data idempotent. Evidence: validate, migrate status up to date, lint, typecheck, build pass; test 2/2; test:integration 4/4 (parent re-ran: 4/4). Decision: Railway proxy cert is self-signed -> dev-only DATABASE_SSL_REJECT_UNAUTHORIZED=false; production uses Railway private network or verified TLS.
- 2026-10-25: T1.3 done (delegated), 78376d0. CalendarDate strings, TZDate-based today, expiry rules (EXPIRED after expiry day, CRITICAL <=30, WARNING <= max threshold), Zod env, DomainError family, docs/architecture.md. Evidence: lint, typecheck, build pass; test 42/42; integration 4/4.
- 2026-10-25: T2.1 done (delegated), 765181e. argon2id, DB sessions (12h idle / 7d absolute), rate limit via AuditLog, reset tokens single-use 1h, ConsoleEmailSender default + SMTP when configured (zero cost), `pnpm admin:create`, users admin page, app shell. Evidence: lint, typecheck, build pass; test 63/63 (parent re-ran 63/63); integration 17/17; e2e 7/7.
- Pending: `.env.example` lacks optional SESSION_SECRET, VAPID_*, SMTP_* placeholders — a permission deny rule blocks agent edits to .env files; user must add them or allow it. Documented in README and docs/architecture.md §5.

- 2026-10-25: T2.2–T2.4 done (one delegated writer, three stacked commits). Migrations: units.active; COUNT_CORRECTION_IN/OUT. Decisions: product code auto-generated when empty; stock buckets mutually exclusive (expired > quarantine/blocked > blockedQuantity); per-product row lock (FOR NO KEY UPDATE) serializes stock ops; expired lots accept only WRITE_OFF/RETURN/count corrections; write-off/return need inventory.writeoff (admin only by seed); low-stock alerts after commit, log-and-swallow, skipDuplicates; count reconciliation uses counted − current quantity; isDomainError helper because Next bundles errors.ts twice. Evidence after T2.4: lint, typecheck, build pass; test 176/176; integration 50/50 (parent re-ran 50/50); e2e 12/12.
- Decision: the Railway dev DB accumulates TEST-/E2E- rows (append-only movements can't be deleted). Production must use a separate, clean database.

## Next step
Finish T3.3 (lean), then T4.1.
