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
| `pnpm test:e2e` | End-to-end tests (Playwright, Chromium) |

First e2e run needs `pnpm exec playwright install chromium`.
