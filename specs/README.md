# Specifications

> **📋 Product & Technical Specs**: Organized by application, one spec per feature, with 4 standard planning documents and optional lifecycle logs.

---

## 📁 Directory Structure

```text
specs/
├── README.md                       # This file
├── AGENTS.md                       # Conventions for AI agents & contributors
├── references/                     # On-demand spec templates and deep references
│   ├── improvement-template.md      # Optional IMPROVEMENT.md template
│   ├── progress-template.md         # Optional PROGRESS.md template
│   └── review-template.md           # Optional REVIEW.md template
│
├── APP/                            # Atmos application (web / desktop / cli / api)
│   ├── APP-001_atmos-core/
│   │   ├── BRAINSTORM.md           # Brainstorm
│   │   ├── PRD.md                  # Product Requirements
│   │   ├── TECH.md                 # Technical Design
│   │   ├── TEST.md                 # Test Plan
│   │   ├── PROGRESS.md             # Optional implementation progress / handoff
│   │   └── REVIEW.md               # Optional implementation review findings
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

Concrete specs should not keep empty template scaffolding. Keep the four standard files, but delete unused placeholder sections inside them rather than leaving blank template content; only template/example directories should retain placeholders.

## 🧭 Optional Spec Logs

Some specs include optional sibling files:

| File | Role | Use when |
|------|------|----------|
| `PROGRESS.md` | Implementation progress / handoff | Work spans multiple sessions, layers, agents, or owners |
| `REVIEW.md` | Implementation review fixes | Code review finds architecture, maintainability, testability, or code-size issues |
| `IMPROVEMENT.md` | Post-ship operational log | Production quality learnings, incidents, parity gaps, and follow-ups |

These files are not requirements sources. Requirements live in `PRD.md`, architecture in `TECH.md`, and verification contracts in `TEST.md`.

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
| **APP-017** | Atmos Automations | `specs/APP/APP-017_atmos-automations/` (`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`, `PROGRESS.md`, `REVIEW.md`) |
| **APP-018** | ACP Protocol Upgrade | `PRD.md` |
| **APP-019** | GitHub Automation Triggers | `specs/APP/APP-019_github-automation-triggers/` (`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`, `REVIEW.md`) |
| **APP-020** | Relay Stable Tenant Identity | `specs/APP/APP-020_relay-stable-tenant-identity/` (`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`, `REVIEW.md`) |

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
