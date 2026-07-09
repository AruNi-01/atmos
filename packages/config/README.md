# Config Package - Code Structure

> File/folder structure for `@atmos/config`. Working instructions: [AGENTS.md](./AGENTS.md).

---

## Directory Structure

```
packages/config/
├── typescript/
│   ├── base.json           # Shared TS 7-safe defaults
│   ├── nextjs.json         # Next.js apps
│   ├── react.json          # React libraries
│   ├── react-native.json   # Expo mobile helpers
│   └── workers.json        # Cloudflare Workers (relay)
├── package.json
├── AGENTS.md
└── README.md
```

ESLint and Prettier are **not** owned here — apps use `eslint-config-next` / local configs; see [AGENTS.md](./AGENTS.md).

---

## Usage

```json
{
  "extends": "../config/typescript/base.json",
  "compilerOptions": {
    "declaration": true
  }
}
```

Package exports:

- `@atmos/config/typescript/base`
- `@atmos/config/typescript/nextjs`
- `@atmos/config/typescript/react`
- `@atmos/config/typescript/react-native`
- `@atmos/config/typescript/workers`

---

## Related

- [AGENTS.md](./AGENTS.md) — TypeScript 7 dual-package model
- [QUALITY-005](../../specs/APP/QUALITY-005_typescript-7-upgrade/TECH.md)
