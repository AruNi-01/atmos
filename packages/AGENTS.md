# Packages Directory - AGENTS.md

> **📦 Shared JS/TS** (and edge Workers): UI, i18n, config — plus **Relay** for Atmos Computer.

---

## 📁 Shared packages

| Package | Purpose | Namespace | AGENTS |
|---------|---------|-----------|--------|
| **ui** | Component library | `@workspace/ui` | [ui/AGENTS.md](ui/AGENTS.md) |
| **shared** | Utils & hooks | `@atmos/shared` | [shared/AGENTS.md](shared/AGENTS.md) |
| **config** | TS/Lint configs | `@workspace/config` | [config/AGENTS.md](config/AGENTS.md) |
| **i18n** | Translations | `@workspace/i18n` | [i18n/AGENTS.md](i18n/AGENTS.md) |
| **relay** | Control plane + Relay Worker (APP-016) | `@atmos/relay` (private) | [relay/AGENTS.md](relay/AGENTS.md) |

---

## Build And Test

```bash
bun install
bun run --filter <package> test    # where defined
cd packages/relay && bunx wrangler dev
```

---

## API clients live in apps

`@workspace/ui` and other packages stay **free of `apps/api` clients**. Each app owns `src/api/` (e.g. `apps/web/src/api/`). Types should track `apps/api` DTOs.

---

## Safety Rails

### NEVER

- API calls in `@workspace/ui`.
- Business rules in `packages/relay` beyond routing/auth/presence.

### ALWAYS

- `workspace:*` for monorepo deps.
- Deploy relay only after D1 migrations ([relay/README.md](relay/README.md)).

---

## Related

- [relay/AGENTS.md](relay/AGENTS.md)
- [../apps/web/AGENTS.md](../apps/web/AGENTS.md)
