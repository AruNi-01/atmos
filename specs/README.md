# Specifications

> **📋 Product & Technical Specs**: Organized by application, one spec per feature, with 4 standard documents each.

---

## 📁 Directory Structure

```
specs/
├── README.md                       # This file
├── AGENTS.md                       # Conventions for AI agents & contributors
│
├── APP/                            # Atmos application (web / desktop / cli / api)
│   ├── APP-001_atmos-core/
│   │   ├── BRAINSTORM.md           # Brainstorm
│   │   ├── PRD.md                  # Product Requirements
│   │   ├── TECH.md                 # Technical Design
│   │   └── TEST.md                 # Test Plan
│   ├── APP-002_.../
│   ├── APP-016_atmos-computer/
│   └── ...
│
├── Landing/                        # Marketing landing (apps/landing)
│   └── Landing-NNN_.../
│
└── Docs/                           # Documentation site (apps/docs)
    └── Docs-NNN_.../
```

---

## 🧩 Three Top-Level Zones

| Zone | Scope | Code |
|------|-------|------|
| **APP/** | Atmos application features (web / desktop / cli / api) | [`apps/web`](../apps/web), [`apps/desktop`](../apps/desktop), [`apps/cli`](../apps/cli), [`apps/api`](../apps/api) |
| **Landing/** | Marketing landing page | [`apps/landing`](../apps/landing) |
| **Docs/** | Documentation site | [`apps/docs`](../apps/docs) |

---

## 📄 The 4 Standard Documents

Every `APP-NNN_xxx` / `Landing-NNN_xxx` / `Docs-NNN_xxx` directory contains:

| File | Role | Answers |
|------|------|---------|
| `BRAINSTORM.md` | Brainstorm | Problem space, exploration, open ideas |
| `PRD.md` | Product Requirements | **WHAT & WHY** — user stories, features, success metrics |
| `TECH.md` | Technical Design | **HOW** — architecture, data model, APIs, rollout |
| `TEST.md` | Test Plan | Test strategy, key scenarios, acceptance criteria |

All four files are always present. Missing content stays as a **template placeholder** to keep the structure uniform and discoverable.

---

## 📚 Current Specs

### APP

| ID | Topic | Existing Source |
|----|-------|----------------|
| **APP-001** | Atmos Core (v1.0 MVP) | `PRD.md`, `TECH.md`, `BRAINSTORM.md` (from legacy `mvp-scope`) |
| **APP-002** | Terminal Multiplexing System | `TECH.md` |
| **APP-003** | Web Terminal Dynamic Title (Shell Shim Injection) | `TECH.md` |
| **APP-004** | Local Agent Integration (ACP) | `TECH.md` |
| **APP-005** | GitHub Integration (via `gh` CLI) | `PRD.md` |
| **APP-006** | Project Wiki | `TECH.md` |
| **APP-007** | Wiki Incremental Update | `TECH.md` |
| **APP-008** | Wiki Ask | `TECH.md` |
| **APP-009** | Desktop (Tauri 2.0) | `TECH.md` |
| **APP-010** | Preview Element Select (Same-Origin) | `TECH.md` |
| **APP-011** | Preview Cross-Origin Extension (Browser Ext + Desktop) | `TECH.md` |
| **APP-012** | Remote Access | `TECH.md` |
| **APP-013** | Project-Level Review Session | `BRAINSTORM.md` |
| **APP-014** | Canvas | `PRD.md` |
| **APP-016** | Atmos Computer（Cloudflare Relay + DO） | `specs/APP/APP-016_atmos-computer/`（`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`） |
| **APP-018** | ACP Protocol Upgrade | `PRD.md` |

### Landing

_Empty. Start the first spec from `Landing-001_xxx`._

### Docs

_Empty. Start the first spec from `Docs-001_xxx`._

---

## 🆕 Creating a New Spec

1. Pick a zone (`APP` / `Landing` / `Docs`).
2. Take the next sequence number. Name the directory `<ZONE>-NNN_kebab-case-title` (e.g. `APP-013_new-feature`).
3. Copy an existing spec directory as a template, or create the four files by hand.
4. Register the new spec in the **Current Specs** table above (and in any zone-level README).

```bash
# Create a new APP spec
mkdir -p specs/APP/APP-013_new-feature
cp specs/APP/APP-012_remote-access/{BRAINSTORM,PRD,TECH,TEST}.md \
   specs/APP/APP-013_new-feature/
```

See [`AGENTS.md`](./AGENTS.md) for detailed conventions.

---

## 🔗 Related

- **Architecture & design docs**: [`docs/`](../docs/)
- **AI collaboration guide**: [`../AGENTS.md`](../AGENTS.md)
- **Application code**: [`apps/`](../apps/)
- **Rust crates**: [`crates/`](../crates/)
