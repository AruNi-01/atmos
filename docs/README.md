# Documentation - Deep Architecture & Design

> **📚 Second Layer Documentation**: This directory contains deep-dive architecture documentation, design decisions, and development guides for developers who want to understand the system in depth.

---

## 📁 Documentation Structure

```
docs/
├── architecture.md         # System architecture overview
├── development.md          # Development guide
├── deployment.md           # Deployment guide
├── release.md              # Release guide
├── api-design.md          # API design principles
├── justfile               # Task runner documentation
├── README.md              # Overview of documentation
├── architecture           # Detailed architecture documentation
├── development            # Detailed development documentation
├── api                    # API documentation
├── agent_changelog        # Agent changelog documentation
└── adr/                   # Architecture Decision Records
    ├── README.md
    ├── 001-monorepo-structure.md
    └── ...
```

---

## 📄 Documentation Files

### `architecture.md`
System architecture overview including:
- Monorepo structure
- Frontend/Backend separation
- Code sharing strategy
- Technology stack rationale

**Audience**: Architects, Lead Developers, New Team Members

---

### `development.md`
Development workflow and guidelines:
- Setting up development environment
- Coding standards and conventions
- Git workflow
- Testing strategy

**Audience**: All Developers

---

### `deployment.md`
Deployment processes and infrastructure:
- Build process
- CI/CD pipeline
- Environment configuration
- Production deployment
- Desktop release workflow and Homebrew tap sync

**Audience**: DevOps, Senior Developers

See also: [`desktop-release.md`](./desktop-release.md) for the desktop release runbook and recovery procedures.

---

### `release.md`
Atmos release model and operations:
- CLI, Local Runtime, and Desktop release lines
- Stable vs prerelease/test release rules
- Release helper skills and workflows
- Version detection and post-release verification

**Audience**: Maintainers, Release Engineers

---

### `api-design.md`
API design principles and standards:
- REST API conventions
- GraphQL schema design
- Error handling
- Versioning strategy

**Audience**: Backend Developers, API Consumers

---

### `justfile`
Task runner (Just) command documentation:
- Available commands
- Command usage examples
- Custom task definitions

**Audience**: All Developers

---

## 📂 ADR (Architecture Decision Records)

The `adr/` directory contains Architecture Decision Records documenting important architectural decisions.

See [adr/README.md](adr/README.md) for details.

**Format**: Each ADR follows a standard template:
- Context
- Decision
- Consequences
- Status

**Examples**:
- `001-monorepo-structure.md` - Why we chose monorepo
- `002-ui-component-strategy.md` - shadcn/ui adoption
- `003-internationalization.md` - next-intl choice

**Audience**: Architects, Technical Decision Makers

---

## 🎯 Documentation Hierarchy

```
Level 1: Root README.md
  └─ Quick overview for everyone

Level 2: docs/ (This directory)
  └─ Deep architecture for architects

Level 3: Component AGENTS.md
  └─ Working instructions for developers

Level 4: Component README.md
  └─ Code structure for deep divers
```

---

## 📝 When to Read What?

| You Want To... | Read This |
|----------------|-----------|
| Understand overall project | [Root README.md](../README.md) |
| Navigate as AI agent | [Root AGENTS.md](../AGENTS.md) |
| Understand architecture | `architecture.md` |
| Set up development | `development.md` |
| Deploy the system | `deployment.md` |
| Release Atmos | [`release.md`](./release.md) |
| Run a desktop release | [`desktop-release.md`](./desktop-release.md) |
| Design APIs | `api-design.md` |
| Understand a decision | `adr/*.md` |
| Work on specific component | Component's AGENTS.md |
| Understand code structure | Component's README.md |

---

## 🔄 Updating Documentation

### Adding New ADR

```bash
cd docs/adr
cp 000-template.md 00X-my-decision.md
# Edit the file with your decision
```

### Updating Architecture Docs

When making significant architectural changes:
1. Update relevant `.md` file in `docs/`
2. Create ADR if it's a major decision
3. Update component AGENTS.md if it affects usage
4. Update component README.md if it affects structure

---

## 🛠 Documentation Tools

- **Markdown**: All docs use GitHub-flavored Markdown
- **Mermaid**: For diagrams (supported in GitHub)
- **ADR Tools**: Manual ADR management (no tools needed)

---

## 🔗 Related Documentation

- **For Quick Start**: [Root README.md](../README.md)
- **For AI Navigation**: [Root AGENTS.md](../AGENTS.md)
- **For Desktop Release Operations**: [`desktop-release.md`](./desktop-release.md)
- **For Complete Release Operations**: [`release.md`](./release.md)
- **For Specs**: [specs/](../specs/)
- **For Component Work**: [apps/AGENTS.md](../apps/AGENTS.md), [packages/AGENTS.md](../packages/AGENTS.md)

---

## 📚 External Resources

- [Architectural Decision Records](https://adr.github.io/)
- [C4 Model](https://c4model.com/) (for architecture diagrams)
- [Monorepo Tools](https://monorepo.tools/)

---

**Contributing**: When adding new documentation, ensure it fits the right level of the hierarchy and doesn't duplicate information.
