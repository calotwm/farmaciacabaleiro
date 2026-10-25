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
- [ ] V1 Design system + shell (tokens, font, shared ui, sidebar/top bar/drawer)
- [ ] V2 `/vencimientos` page (buckets, table, filters, summary strip, monthly SVG chart, CSV export)
- [ ] V3 Dashboard (KPI row, prioritized expirations table, separate panels, upcoming deliveries, quick actions)
- [ ] V4 Configuración completion + polish of the other main pages

## Routes
- All tasks: inline (single writer; mapped the shell, ui kit, dashboard and lots query files directly).

## Progress / Evidence
- V1 notes: the sidebar already listed Vencimientos; the nav is a client component without permission context, so access is enforced by the page itself (inventory.read), same as /lotes.
