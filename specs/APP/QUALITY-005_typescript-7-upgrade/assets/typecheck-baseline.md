# Typecheck baseline (pre TypeScript 7)

Captured 2026-07-09 on the implementing machine before flipping the default binary.

| Field | Value |
|-------|-------|
| CPU cores (`hw.ncpu`) | 10 |
| bun | 1.4.0 |
| `apps/web` tsc | 5.9.3 |
| `apps/mobile` tsc | 6.0.3 |

## Wall times (`/usr/bin/time -p`, `tsc --noEmit`)

| Package | real (s) | user (s) | sys (s) |
|---------|----------|----------|---------|
| `apps/web` | 19.23 | 24.03 | 2.69 |
| `apps/mobile` | 2.06 | 4.39 | 0.21 |
| `packages/ui` | 5.98 | 9.82 | 0.51 |

Full monorepo typecheck was not a single orchestrated command pre-upgrade; use the sum of package runs / root `bun run typecheck` after install as the comparison target in `typecheck:bench`.
