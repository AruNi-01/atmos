# Architecture Decision Records (ADR)

> **📋 This directory contains important architectural decisions** made during the project lifecycle. Each ADR documents the context, decision, and consequences.

---

## 🎯 What is an ADR?

An Architecture Decision Record (ADR) is a document that captures an important architectural decision made along with its context and consequences.

**Purpose**:
- Document WHY a decision was made
- Provide context for future developers
- Track architectural evolution
- Avoid repeating past discussions

---

## 📋 ADR Index

| ADR | Title | Status | Date | Decision Makers |
|-----|-------|--------|------|-----------------|
| [001](./001-monorepo.md) | Adopt Monorepo Architecture | ✅ Accepted | 2024-01-10 | @alice (Architect), @bob (Tech Lead) |
| [002](./002-agent-crate-positioning.md) | Agent Crate as Independent Vertical Module | ✅ Accepted | 2025-02-18 | - |
| [003](./003-terminal-scrolling-and-resize.md) | 终端滚动与 Resize 架构优化 | 🔄 Superseded | 2026-03-17 | - |
| [004](./004-terminal-tmux-control-mode.md) | 终端改为 tmux Control Mode Transport | ✅ Accepted | 2026-04-19 | Aaryn, Codex |

---

## 📊 Status Definitions

| Status | Meaning |
|--------|---------|
| ✅ **Accepted** | Decided and being implemented |
| 🤔 **Proposed** | Under discussion, not yet decided |
| ❌ **Rejected** | Decided not to adopt |
| ⏸️ **Deprecated** | No longer used, but kept for record |
| 🔄 **Superseded** | Replaced by another ADR |
| 📝 **Draft** | Being written |

---

## 📝 ADR Template

When creating a new ADR, use this template:

```markdown
# ADR-XXX: [Title]

**Status**: [Proposed | Accepted | Rejected | Deprecated | Superseded]
**Date**: YYYY-MM-DD
**Decision Makers**: @name1, @name2

---

## Context

What is the issue we're seeing that is motivating this decision or change?

## Decision

What is the change that we're proposing and/or doing?

## Consequences

What becomes easier or more difficult to do because of this change?

### Positive

- Benefit 1
- Benefit 2

### Negative

- Trade-off 1
- Trade-off 2

### Neutral

- Other impact 1

## Alternatives Considered

What other options did we consider?

### Alternative 1: [Name]

**Description**: ...

**Pros**: ...

**Cons**: ...

**Why not chosen**: ...

## References

- Link 1
- Link 2
```

---

## 🔄 Creating a New ADR

### Step 1: Copy Template

```bash
cd docs/adr
cp 000-template.md XXX-my-decision.md
```

### Step 2: Fill in Details

- Number: Sequential (e.g., 002, 003)
- Title: Brief, descriptive (e.g., "Use Next.js for Frontend")
- Status: Start with "Proposed"
- Date: Today's date

### Step 3: Document Decision

- **Context**: Explain the problem or situation
- **Decision**: State what you're deciding
- **Consequences**: List impacts (positive, negative, neutral)
- **Alternatives**: Show what else was considered

### Step 4: Get Review

- Share with team
- Discuss in architecture meetings
- Update status based on outcome

### Step 5: Update Index

Add entry to the table above.

---

## 📚 ADR Categories

### Infrastructure
- Monorepo vs. Polyrepo
- CI/CD pipeline choices
- Deployment strategies

### Technology Stack
- Framework selections
- Library choices
- Language decisions

### Architecture Patterns
- Component structure
- State management
- Data flow

### Development Practices
- Code style standards
- Testing strategies
- Documentation approaches

---

## 🔍 When to Create an ADR

**DO create an ADR for**:
- ✅ Choosing a major framework or library
- ✅ Adopting a new architectural pattern
- ✅ Changing build or deployment processes
- ✅ Decisions with long-term impact
- ✅ Decisions that affect multiple teams

**DON'T create an ADR for**:
- ❌ Minor code refactoring
- ❌ Bug fixes
- ❌ Routine feature implementations
- ❌ Personal coding preferences

---

## 🎯 Best Practices

### 1. Be Concise
Keep ADRs short and focused. 1-2 pages is ideal.

### 2. Be Specific
Clearly state what is being decided, not what might be decided.

### 3. Document Context
Future readers need to understand WHY, not just WHAT.

### 4. List Consequences
Be honest about trade-offs. No decision is perfect.

### 5. Keep It Updated
Update status when decisions change or are superseded.

### 6. Use Simple Language
Avoid jargon. Write for future team members.

---

## 📊 ADR Lifecycle

```
1. Draft
   └─ Document proposal
   
2. Proposed
   └─ Share with team
   └─ Gather feedback
   
3. Accepted / Rejected
   └─ Final decision made
   └─ Implementation begins (if accepted)
   
4. Deprecated / Superseded (optional)
   └─ Decision no longer valid
   └─ Reference replacement ADR
```

---

## 🔗 Related Documentation

- **Architecture Overview**: [../architecture.md](../architecture.md)
- **Documentation Guide**: [../README.md](../README.md)
- **Tech Specs**: [../../specs/tech/](../../specs/tech/)

---

## 📚 External Resources

- [ADR GitHub Organization](https://adr.github.io/)
- [Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
- [ADR Tools](https://github.com/npryce/adr-tools)

---

**Contributing**: When making significant architectural decisions, document them here to help future developers understand the project's evolution.
