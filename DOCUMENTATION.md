# Documentation System Overview

> **📚 Complete Documentation Hierarchy**: This document explains the entire documentation structure and how to navigate it.

---

## 🎯 Design Principles

### 1. **Layered Architecture**
Documentation is organized in layers, each serving a specific purpose and audience.

### 2. **Progressive Disclosure**
Start simple, dive deeper as needed. No information overload.

### 3. **Single Responsibility**
Each document has ONE clear purpose. No duplication.

### 4. **On-Demand Loading**
Read only what you need, when you need it.

### 5. **Easy Maintenance**
When code changes, update the corresponding document only.

---

## 📊 Documentation Layers

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Entry Point (5-minute overview)                   │
├─────────────────────────────────────────────────────────────┤
│ README.md          - Project overview for everyone         │
│ AGENTS.md          - AI/Agent 60-second navigation         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: Deep Dive (Architecture & Design)                 │
├─────────────────────────────────────────────────────────────┤
│ docs/              - Architecture documentation            │
│ specs/             - Product & Technical specifications    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: Component Work (Task-oriented)                    │
├─────────────────────────────────────────────────────────────┤
│ apps/AGENTS.md     - How to create/work on apps            │
│ packages/AGENTS.md - How to use/create packages            │
│ app/*/AGENTS.md    - Specific app work instructions        │
│ pkg/*/AGENTS.md    - Specific package work instructions    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 4: Code Structure (Deep dive)                        │
├─────────────────────────────────────────────────────────────┤
│ */README.md        - File/folder structure explanation     │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 File Hierarchy

```
vibe-habitat/
│
├── README.md                    # 📄 L1: 5-min project overview
├── AGENTS.md                    # 🤖 L1: AI 60-sec navigation
│
├── docs/                        # 📚 L2: Deep architecture
│   ├── README.md                # Documentation guide
│   ├── architecture.md          # System architecture
│   ├── development.md           # Development guide
│   ├── deployment.md            # Deployment guide
│   └── adr/                     # Architecture decisions
│       ├── README.md
│       └── *.md
│
├── specs/                       # 📋 L2: Specifications
│   ├── README.md                # Specification guide
│   ├── prd/                     # Product requirements
│   ├── tech/                    # Technical specs
│   └── design/                  # Design assets
│
├── apps/                        # 🚀 L3: Applications
│   ├── AGENTS.md                # How to create apps
│   ├── web/
│   │   ├── AGENTS.md            # How to work on web app
│   │   └── README.md            # L4: Code structure
│   ├── landing/
│   │   ├── AGENTS.md
│   │   └── README.md
│   └── docs/
│       ├── AGENTS.md
│       └── README.md
│
└── packages/                    # 📦 L3: Shared packages
    ├── AGENTS.md                # How to use/create packages
    ├── ui/
    │   ├── AGENTS.md            # How to work on UI package
    │   └── README.md            # L4: Code structure
    ├── shared/
    │   ├── AGENTS.md
    │   └── README.md
    └── ...
```

---

## 🎭 Personas & Entry Points

### 🆕 New Developer
**Goal**: Understand project and start contributing

**Path**:
1. Read `README.md` (5 min)
2. Read `AGENTS.md` (1 min)
3. Pick a component, read its `AGENTS.md`
4. Start coding!

---

### 🤖 AI Agent
**Goal**: Navigate quickly and complete tasks

**Path**:
1. Start at `AGENTS.md`
2. Use decision tree to find component
3. Read component's `AGENTS.md`
4. Execute task

---

### 🏗️ Architect
**Goal**: Understand deep architecture and make decisions

**Path**:
1. Read `README.md` (overview)
2. Read `docs/architecture.md`
3. Review `docs/adr/` (decisions)
4. Review `specs/tech/` (technical specs)

---

### 📊 Product Manager
**Goal**: Understand product requirements and status

**Path**:
1. Read `README.md` (overview)
2. Review `specs/prd/` (requirements)
3. Check `specs/design/` (designs)

---

### 🎨 Designer
**Goal**: Understand UI/UX and design system

**Path**:
1. Read `packages/ui/AGENTS.md` (design system)
2. Review `specs/design/` (mockups)
3. Check `packages/ui/README.md` (code structure)

---

### 🔧 DevOps Engineer
**Goal**: Understand deployment and infrastructure

**Path**:
1. Read `README.md` (overview)
2. Read `docs/deployment.md`
3. Review `justfile` (commands)

---

## 📝 Document Types & Purposes

| Document Type | Purpose | Audience | Location |
|---------------|---------|----------|----------|
| **README.md (Root)** | Project overview | Everyone | `/` |
| **AGENTS.md (Root)** | AI navigation | AI/Agents | `/` |
| **docs/*.md** | Architecture | Architects | `/docs/` |
| **specs/prd/*.md** | Requirements | PM/Designers | `/specs/prd/` |
| **specs/tech/*.md** | Tech specs | Engineers | `/specs/tech/` |
| **AGENTS.md (Component)** | Work instructions | Developers | `apps/*/`, `packages/*/` |
| **README.md (Component)** | Code structure | Deep divers | `apps/*/`, `packages/*/` |

---

## 🔄 Update Workflow

### When Code Changes

```
Code Change
    │
    ├─→ Update Component README.md (if structure changed)
    │
    ├─→ Update Component AGENTS.md (if workflow changed)
    │
    ├─→ Update docs/*.md (if architecture changed)
    │
    └─→ Create ADR (if major decision made)
```

### When Requirements Change

```
Requirement Change
    │
    ├─→ Update specs/prd/*.md
    │
    ├─→ Update specs/tech/*.md
    │
    └─→ Update docs/architecture.md (if needed)
```

---

## ✅ Documentation Checklist

### Creating New App/Package

- [ ] Create `AGENTS.md` with work instructions
- [ ] Create `README.md` with code structure
- [ ] Update parent `AGENTS.md` (apps/ or packages/)
- [ ] Update root `AGENTS.md` decision tree
- [ ] Update root `README.md` if significant

### Making Architectural Change

- [ ] Create ADR in `docs/adr/`
- [ ] Update `docs/architecture.md`
- [ ] Update affected component `AGENTS.md`
- [ ] Update `specs/tech/*.md` if needed

### Adding New Feature

- [ ] Create/update `specs/prd/*.md`
- [ ] Create/update `specs/tech/*.md`
- [ ] Update component `AGENTS.md`
- [ ] Create ADR if significant decision

---

## 🚫 Anti-Patterns

❌ **DON'T** repeat the same information in multiple places
❌ **DON'T** put working instructions in README.md
❌ **DON'T** put code structure in AGENTS.md
❌ **DON'T** create docs without clear audience
❌ **DON'T** write long documents (split into layers)

---

## ✅ Best Practices

✅ **DO** keep documents focused on one purpose
✅ **DO** use cross-references instead of duplication
✅ **DO** update docs when code changes
✅ **DO** write for specific audience
✅ **DO** use progressive disclosure

---

## 🔍 Quick Reference

**I want to...**

| Task | Go To |
|------|-------|
| Get project overview | `README.md` |
| Navigate as AI | `AGENTS.md` |
| Understand architecture | `docs/architecture.md` |
| See product requirements | `specs/prd/` |
| Work on web app | `apps/web/AGENTS.md` |
| Understand UI package code | `packages/ui/README.md` |
| Deploy the system | `docs/deployment.md` |
| Make architectural decision | `docs/adr/` |

---

## 📊 Documentation Health

### Metrics to Track

1. **Coverage**: All components have AGENTS.md and README.md
2. **Freshness**: Docs updated within 1 week of code changes
3. **Clarity**: No confusion reported by new developers
4. **Discoverability**: Easy to find the right document

### Review Schedule

- **Weekly**: Check component docs match code
- **Monthly**: Review architecture docs
- **Quarterly**: Review specs and ADRs

---

**Maintaining**: Documentation is code. Keep it clean, updated, and organized.
