# Feature: Vencimientos module, visual identity, dashboard and settings completion

## Objective
Develop the Vencimientos (expirations) module, give the app a sober editorial visual identity, rebuild the
dashboard around real operational data (expirations, low stock, upcoming supplier deliveries) and complete
the Configuración area. Every figure comes from a real query; no business-logic or data-model changes.

## Constraints
- Public repo: never commit secrets; nothing is run against production. UI copy es-AR (DD/MM/AAAA, ARS, America/Argentina/Buenos_Aires); code and comments in English.
- Visual brief: ivory/warm-gray canvas, graphite text, pharmaceutical red accent, amber warnings, green positives; IBM Plex Sans; thin borders, 8-12px radii, minimal shadows; no gradients, glass, tinted icon circles or card-grid heroes.
- No chart library installed: charts are plain SVG.
- TDD off (no project configuration); focused tests for new queries and domain logic. Runners: Vitest (unit), `vitest.integration.config.ts` (integration, dev DB).
- Delivery: one PR per task from `main`, work-unit Conventional Commits, merge authorized by the user. `pnpm build` dirties pnpm-lock.yaml: revert, do not commit.

## Tasks
- [x] V1 Design system + shell (tokens, font, shared ui, sidebar/top bar/drawer) - PR #22, merge 3fae1fb
- [x] V2 `/vencimientos` page (buckets, table, filters, summary strip, monthly SVG chart, CSV export) - PR #23, merge 223a6a1
- [x] V3 Dashboard (KPI row, prioritized expirations table, separate panels, upcoming deliveries, quick actions) - PR #24, merge 1a3e8f4
- [x] V4 Configuración completion + polish of the other main pages - branch `feat/settings-and-polish`

## Routes
- All tasks: inline (single writer; mapped the shell, ui kit, dashboard and lots query files directly).

## Progress / Evidence
- V1 notes: the sidebar already listed Vencimientos; the nav is a client component without permission context, so access is enforced by the page itself (inventory.read), same as /lotes.
- V1 checks: pnpm lint clean; pnpm typecheck clean; pnpm test 43 files / 306 tests; pnpm build ok (IBM Plex Sans fetched by next/font at build). Not visually verified.
- V2: pure domain `expiration-views.ts` (buckets 7/30/max-threshold, bucket -> lot filters, upcoming months) with unit tests; `expirationSummary` read (aggregates built on the list's own where-clause so totals match the table); integration test `tests/integration/expirations.test.ts` (rolled-back tx, isolated by a unique product name) passes against the dev DB. Page: summary strip doubles as bucket switcher, filters (search/category/supplier), table, SVG bar chart of units per month (6 months) with sr-only table, CSV export reusing `/api/export/lotes` with the same filters. Added (app)/loading.tsx and (app)/error.tsx boundaries.
- V2 checks: pnpm lint clean; pnpm typecheck clean; pnpm test 44 files / 312 tests; pnpm build ok; expirations integration 1/1. Authenticated page not viewed in a browser (no credentials used); dev-server curl sanity skipped.
- V3: compact KPI strip (existing stock KPIs, expiring card captioned with its window); prioritized table of lots expiring in 30 days (8 rows, expired lots excluded) and separate panels for expired-with-stock, low/out-of-stock (new `lowStockProducts` read, same rule as the KPI counts), upcoming supplier deliveries (new `upcomingDeliveries` read, open visits oldest first so late ones lead, flagged with the existing `deliveryAlertState`, plus the four delivery counters), last movements and unread alerts. Quick actions in the header, gated by receiving.write / inventory.write / inventory.read. Replaced `expiringLots` by `upcomingLots`/`expiredLots` (card-grid hero and tinted icon circles removed); delivery status badges moved to the new palette.
- V3 checks: pnpm lint clean; pnpm typecheck clean; pnpm test 44 files / 312 tests; dashboard integration file 4/4 (rewritten for the new reads); pnpm build ok. Not visually verified.
- V4 mapping: /configuracion was a bare link list; existing pages general (all four values in one form), notificaciones, usuarios, categorias, unidades. Settings stored but unused: currency and defaultMinStock; thresholds were used.
- V4: /configuracion now has a layout with a section switcher filtered by permission (General, Vencimientos, Notificaciones, Categorías, Unidades, Usuarios y roles, Mi cuenta; the index redirects to the first visible section). General (pharmacy name, currency, default min stock) and Vencimientos (thresholds plus how lots are classified, from the real settings) are separate forms that save only their own section through the unchanged update service. New Mi cuenta section: own password change (new AuthService.changePassword: verifies the current password, applies the existing policy, revokes all sessions and opens a fresh one for this device; unit-tested). Wiring: default min stock prefills the new-product form; the configured currency is used in product/lot/receipt detail and in the product, price and movement-cost labels.
- V4 polish (styling only): shared PageHeader on productos, lotes, proveedores, entregas, recepciones, movimientos, conteos, notificaciones; framed tables (Table framed) and framed filter bars on the list pages; delivery status badges in the new palette.
- V4 checks: pnpm lint clean; pnpm typecheck clean; pnpm test 46 files / 322 tests; pnpm build ok. No integration file changed. Not visually verified; password change not exercised against a real session.
