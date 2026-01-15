# AGENTS.md

## Monorepo Structure

```
vibe-habitat/
├── vibe-habitat-web/     # Frontend - Next.js 16 + React 19 + Tailwind v4
├── docs/                 # Documentation - PRD, TechPlan, etc.
└── (future)              # Backend, shared packages, etc.
```

## Project Navigation

- **Frontend**: `vibe-habitat-web/` - Next.js 16 web application
- **Docs**: `docs/` - Project documentation (PRD, technical plans)

## Shared Conventions

### Dependency Management

**Frontend (Bun)**
```bash
cd vibe-habitat-web
bun install          # Install dependencies
bun dev              # Start dev server
bun build            # Production build
bun start            # Start production server
bun lint             # Run ESLint
```

### Code Style (Applies to All Projects)

- **Error Handling**: Handle errors explicitly; avoid empty catch blocks
- **Type Safety**: Enable strict mode; avoid `any` type
- **Naming**: PascalCase (components), camelCase (functions/variables), kebab-case (files)

## Quick Start

### Run Frontend Only

```bash
cd vibe-habitat-web
bun install
bun dev
```

### Run Multiple Projects (Future)

```bash
# When backend is added
cd vibe-habitat-web && bun dev    # Terminal 1
cd vibe-habitat-server && bun dev    # Terminal 2
```

## Project-Specific Details

For detailed code conventions, patterns, and commands for each project, refer to their individual `AGENTS.md`:

- **Frontend**: See [`vibe-habitat-web/AGENTS.md`](vibe-habitat-web/AGENTS.md)
