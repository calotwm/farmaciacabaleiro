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
- Slices: PR1 `feat/scaffold` = 95b00b4 (T1.1), merged to main (74a256d). PR2 `feat/data-model` (T1.2).
- Autonomy: user authorized finishing all tasks without review, including merging slice PRs (2026-10-24).
- Cost policy: zero budget. Anything paid is replaced by a free alternative or skipped and documented. Deployment target re-evaluated at T5.4 against this (Railway usage may consume credits).
- RDD: disabled globally by user on 2026-10-24 ("omitilo siempre"). T1.1 candidate declined. No reviews from here on; ordinary checks remain.

## Tasks
### Stage 1 — Architecture and data model
- [x] T1.1 Scaffold Next.js + TS + Tailwind + shadcn/ui, ESLint, Vitest, Playwright, pnpm scripts
- [x] T1.2 Prisma schema for all entities, constraints, indexes; initial migration + append-only trigger; applied to Railway DB
- [ ] T1.3 Shared kernel: date/timezone utils (AR), money formatting, Zod env validation; architecture doc (`docs/architecture.md`)

### Stage 2 — Auth, permissions, products, lots, inventory
- [ ] T2.1 Auth: login/logout, sessions, password reset, RBAC guards, secure admin bootstrap script, audit log
- [ ] T2.2 Catalog: products, categories, units (CRUD, archive, search, barcode input)
- [ ] T2.3 Lots + stock movements: entries, exits (FEFO), adjustments, returns, write-offs, blocked/quarantine, expiry status
- [ ] T2.4 Physical counts and reconciliation

### Stage 3 — Suppliers, calendar, receiving
- [ ] T3.1 Suppliers CRUD + supplied products
- [ ] T3.2 Scheduled deliveries: calendar + list, reschedule, compliance history
- [ ] T3.3 Receiving flow: from delivery or unscheduled, partial, discrepancies, idempotent atomic confirmation

### Stage 4 — Dashboard, expiry, notifications
- [ ] T4.1 Dashboard KPIs + charts with drill-down
- [ ] T4.2 Expiry module: configurable thresholds, filters
- [ ] T4.3 Notifications: in-app bell, preferences, Web Push (VAPID, SW, multi-device, invalid subs cleanup)
- [ ] T4.4 Worker: daily idempotent rules (expiry, expired with stock, low stock, upcoming/late deliveries, receipt issues)

### Stage 5 — Reports, audit, tests, deployment
- [ ] T5.1 Reports with CSV/Excel export, permission-aware
- [ ] T5.2 Global search + settings section
- [ ] T5.3 Spec section 14 test suite complete (12 scenarios)
- [ ] T5.4 Docker Compose, Railway deploy (web + worker), HTTPS, backup/restore docs, README

## Acceptance criteria
Spec sections 1–15; no feature counted done if only its UI exists.

## Progress
- 2026-10-24: Environment inspected; Railway Postgres provisioned and verified (psql connection OK).
- 2026-10-24: T1.1 done, commit 95b00b4, route: delegated (writer trigger, 2+ files). Evidence: lint, typecheck, build pass; test 2/2; e2e 1/1 (writer); parent spot check typecheck + test pass. Risk high (process_boundary in playwright.config.ts) -> review declined.
- 2026-10-24: T1.2 done (delegated, writer trigger). Prisma 7.10.1 + pg adapter, 31 models, migrations init + stock_movement_append_only (trigger + CHECKs) applied to Railway; seed reference data idempotent. Evidence: validate, migrate status up to date, lint, typecheck, build pass; test 2/2; test:integration 4/4 (parent re-ran: 4/4). Decision: Railway proxy cert is self-signed -> dev-only DATABASE_SSL_REJECT_UNAUTHORIZED=false; production uses Railway private network or verified TLS.

## Next step
T1.3 shared kernel on branch `feat/shared-kernel`.
