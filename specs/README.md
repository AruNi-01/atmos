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
│   ├── review-template.md           # Optional REVIEW.md template
│   └── agent-browser-setup.md       # Optional Agent Browser setup reference
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
| **APP-012** | Tunnel Connector | `TECH.md` |
| **APP-013** | Project-Level Review Session | `BRAINSTORM.md` |
| **APP-014** | Canvas | `PRD.md` |
| **APP-016** | Atmos Computer（Cloudflare Relay + DO） | `specs/APP/APP-016_atmos-computer/`（`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`） |
| **APP-017** | Atmos Automations | `specs/APP/APP-017_atmos-automations/` (`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`, `PROGRESS.md`, `REVIEW.md`) |
| **APP-018** | ACP Protocol Upgrade | `PRD.md` |
| **APP-019** | GitHub Automation Triggers | `specs/APP/APP-019_github-automation-triggers/` (`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`, `REVIEW.md`) |
| **APP-020** | Relay Stable Tenant Identity | `specs/APP/APP-020_relay-stable-tenant-identity/` (`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`, `REVIEW.md`) |
| **APP-021** | Appshots Cross-App Snapshot | `specs/APP/APP-021_appshots-cross-app-snapshot/` (`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`, `REVIEW.md`) |
| **APP-022** | Canvas Terminal New Tab | `specs/APP/APP-022_canvas-terminal-new-tab/` (`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`) |
| **APP-023** | Local Run Server Manager | `specs/APP/APP-023_local-run-server-manager/` (`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`) |
| **APP-024** | Terminal Agent Run Config | `specs/APP/APP-024_terminal-agent-run-config/` (`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`) |
| **APP-025** | Mobile App | `specs/APP/APP-025_mobile-app/` (`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`) |
| **APP-026** | Agent Fix Launcher | `specs/APP/APP-026_agent-fix-launcher/` (`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`) |
| **APP-027** | Canvas Workspace Surfaces | `specs/APP/APP-027_canvas-workspace-surfaces/` (`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`) |
| **APP-028** | Runtime Workbench i18n | `specs/APP/APP-028_runtime-workbench-i18n/` (`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`) |
| **APP-029** | Native Preview Occlusion | `specs/APP/APP-029_native-preview-occlusion/` (`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`) |
| **APP-030** | Terminal Side Chat | `specs/APP/APP-030_terminal-side-chat/` (`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`) |
| **APP-031** | Terminal Selection AI Context | `specs/APP/APP-031_terminal-selection-ai-context/` (`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`) |
| **APP-032** | Antigravity CLI Support | `specs/APP/APP-032_antigravity-cli-support/` (`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`) |
| **APP-033** | Terminal Custom Naming | `specs/APP/APP-033_terminal-custom-naming/` (`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`) |
| **APP-035** | TanStack Query Data Layer | `specs/APP/APP-035_tanstack-query-data-layer/` (`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`) |
| **APP-036** | Grok Build CLI Support | `specs/APP/APP-036_grok-build-cli-support/` (`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`, `REVIEW.md`) |
| **APP-037** | Canvas Local Documents | `specs/APP/APP-037_canvas-local-documents/` (`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`) |
| **APP-038** | Onboarding Page | `specs/APP/APP-038_onboarding-page/` (`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`) |
| **APP-039** | Terminal `/spawn` Command | `specs/APP/APP-039_terminal-spawn-command/` (`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`) |
| **APP-040** | Composer Skills Disable | `specs/APP/APP-040_composer-skills-disable/` (`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`) |
| **APP-041** | Browser Cookie Sync (+ toolbar `···` menu, Clear Cache / Clear Site Data) | `specs/APP/APP-041_browser-cookie-sync/` (`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`) |
| **APP-042** | Disk Analyzer | `specs/APP/APP-042_disk-analyzer/` (`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`) |
| **APP-043** | Workspace Surface Cache (supersedes APP-034) | `specs/APP/APP-043_workspace-surface-cache/` (`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`) |
| **APP-044** | Project / Workspace Groups | `specs/APP/APP-044_project-workspace-groups/` (`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`) |
| **APP-045** | Desktop Electron Dual Shell (Tauri + Electron parallel) | `specs/APP/APP-045_desktop-electron-dual-shell/` (`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`) |
| **APP-046** | Terminal TUI Mouse Tracking (hover + reattach restore) | `specs/APP/APP-046_terminal-tui-mouse-tracking/` (`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`) |
| **APP-047** | Terminal Native OSC Title (agent OSC 0/2 suffix) | `specs/APP/APP-047_terminal-native-osc-title/` (`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`) |
| **APP-048** | API Types (`@atmos/api-types` main `/ws` wire types; Rust enum drift) | `specs/APP/APP-048_api-types/` (`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`) |
| **APP-049** | API Client (`@atmos/api-client` WS session kernel; app-owned URL/auth) | `specs/APP/APP-049_api-client/` (`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`) |
| **APP-050** | Shared Package Layering (roles, edges, AGENTS rewrite, cheap gate) | `specs/APP/APP-050_shared-package-layering/` (`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`) |
| **APP-051** | Infra Jobs & Queue (local-first ports; timers + events; no apalis/MQ in v1) | `specs/APP/APP-051_infra-jobs/` (`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`) |
| **APP-053** | Desktop Browser via Electron `<webview>` (host selection UI; preview→browser rename; remove APP-029) | `specs/APP/APP-053_desktop-browser-webview/` (`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`) |
| **APP-054** | Terminal TUI scroll stability (cross-chunk mouse observe, restore policy, gated CMD_END, proportional wheel) | `specs/APP/APP-054_terminal-tui-scroll-stability/` (`BRAINSTORM.md`, `PRD.md`, `TECH.md`, `TEST.md`) |
| **QUALITY-001** | Large File Code Debt Cleanup | `specs/APP/QUALITY-001_large-file-code-debt-cleanup/` (`TECH.md`, `TEST.md`) |
| **QUALITY-002** | Spec Test Execution Loop | `specs/APP/QUALITY-002_spec-test-execution-loop/` (`TECH.md`, `TEST.md`) |
| **QUALITY-003** | Playwright E2E Harness | `specs/APP/QUALITY-003_playwright-e2e-harness/` (`TECH.md`, `TEST.md`) |
| **QUALITY-004** | Architecture Review | `specs/APP/QUALITY-004_architecture-review/` (`TECH.md`, `TEST.md`) |
| **QUALITY-005** | TypeScript 7 Upgrade | `specs/APP/QUALITY-005_typescript-7-upgrade/` (`TECH.md`, `TEST.md`) |

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
cp specs/APP/APP-012_tunnel-connector/{BRAINSTORM,PRD,TECH,TEST}.md \
   specs/APP/APP-013_new-feature/
```

See [`AGENTS.md`](./AGENTS.md) for detailed conventions.

---

## 🔗 Related

- **Architecture & design docs**: [`docs/`](../docs/)
- **AI collaboration guide**: [`../AGENTS.md`](../AGENTS.md)
- **Application code**: [`apps/`](../apps/)
- **Rust crates**: [`crates/`](../crates/)
