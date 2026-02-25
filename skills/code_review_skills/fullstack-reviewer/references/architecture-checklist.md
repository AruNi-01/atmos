# Architecture Review Checklist

## SOLID Principles

### SRP (Single Responsibility)
- [ ] Each module/class/file has one clear reason to change
- [ ] Functions do one thing at one level of abstraction
- [ ] No "god objects" that know too much about the system
- [ ] HTTP concerns separated from business logic
- [ ] Data access separated from domain rules
- **Ask**: "What is the single reason this module would change?"

### OCP (Open/Closed)
- [ ] New behavior can be added without modifying existing code
- [ ] No cascading changes when adding a new variant/type
- [ ] Extension points exist (strategy pattern, hooks, plugins)
- [ ] Switch/if-else chains don't grow with each new feature
- **Ask**: "Can I add a new variant without touching existing code?"

### LSP (Liskov Substitution)
- [ ] Subtypes don't weaken preconditions or strengthen postconditions
- [ ] No type checks for concrete subtypes (`instanceof` / type guards)
- [ ] Overridden methods don't throw for unsupported operations
- **Ask**: "Can I substitute any subtype without the caller knowing?"

### ISP (Interface Segregation)
- [ ] Interfaces are small and focused
- [ ] No unused methods forced on implementers
- [ ] Callers depend only on what they use
- **Ask**: "Do all implementers use all methods?"

### DIP (Dependency Inversion)
- [ ] High-level modules don't depend on low-level implementations
- [ ] Abstractions (interfaces/traits) define contracts
- [ ] Dependency injection used (not hardcoded `new` or global imports)
- [ ] Business logic can be tested without infrastructure (DB, network)
- **Ask**: "Can I swap the implementation without changing business logic?"

## Code Smells

| Smell | Signs | Severity |
|-------|-------|----------|
| **Long method** | Function > 30 lines, multiple nesting levels | P2 |
| **Large class/module** | File > 300-500 lines, low cohesion | P2 |
| **Feature envy** | Method uses more data from another class than its own | P2 |
| **Data clumps** | Same group of parameters passed together repeatedly | P3 |
| **Primitive obsession** | Using strings/numbers instead of domain types | P3 |
| **Shotgun surgery** | One change requires edits across many files | P2 |
| **Divergent change** | One file changes for many unrelated reasons | P2 |
| **Dead code** | Unreachable or never-called code | P3 |
| **Speculative generality** | Abstractions for hypothetical future needs | P3 |
| **Magic numbers/strings** | Hardcoded values without named constants | P3 |
| **Duplicated code** | Same logic copy-pasted in multiple places | P2 |
| **Boolean parameters** | Function behavior changes based on boolean flag | P3 |
| **Comment over-reliance** | Comments explain "what" instead of code being self-explanatory | P3 |

## Coupling & Cohesion

### Low Coupling
- [ ] Changes to one module don't cascade to many others
- [ ] Modules communicate through well-defined interfaces
- [ ] No circular dependencies between modules/packages
- [ ] Third-party libraries are wrapped (not used directly in business logic)

### High Cohesion
- [ ] Related code lives together
- [ ] Modules have clearly defined boundaries
- [ ] Data and behavior that belong together are co-located
- [ ] Package/module names reflect their purpose

## Layer Architecture

If the project uses layered architecture (e.g., Controller → Service → Repository):

- [ ] Each layer only calls the layer directly below it
- [ ] No layer skipping (Controller → Repository directly)
- [ ] DTOs / view models separate API contracts from domain models
- [ ] Domain models don't depend on infrastructure (framework, DB)
- [ ] Errors are translated at layer boundaries

## Dependency Management

### Monorepo Specific
- [ ] Internal package dependencies are explicit and intentional
- [ ] No circular references between packages
- [ ] Version catalog / workspace config used for shared versions
- [ ] Build order is correct (dependencies before dependents)

### General
- [ ] Dependencies are minimal — no unnecessary packages
- [ ] Dev dependencies vs production dependencies are separated
- [ ] Lock file is committed to source control
- [ ] New dependencies are justified (not reinventing the wheel, but also not for trivial tasks)

## Refactor Heuristics

1. **Split by responsibility, not by size** — A small file can still violate SRP
2. **Introduce abstraction only when needed** — Wait for the second use case
3. **Keep refactors incremental** — Isolate behavior before moving
4. **Preserve behavior first** — Add tests before restructuring
5. **Name things by intent** — If naming is hard, the abstraction might be wrong
6. **Prefer composition over inheritance** — Inheritance creates tight coupling
7. **Make illegal states unrepresentable** — Use types to enforce invariants
8. **Collocate what changes together** — Code that evolves together should live together

## File & Module Organization

- [ ] Files/directories named consistently (kebab-case, PascalCase per convention)
- [ ] Feature-based structure preferred over type-based (routes/users/ vs controllers/)
- [ ] Barrel files (index.ts) scope is limited to avoid circular deps and tree-shaking issues
- [ ] Test files collocated with source (or consistently in `__tests__/`)
- [ ] Configuration files are minimal and well-documented

## Project Health Indicators

| Indicator | Healthy | Unhealthy |
|-----------|---------|-----------|
| **Avg. file size** | 50-200 lines | > 500 lines |
| **Max file size** | < 500 lines | > 1000 lines |
| **Dependency depth** | 2-3 levels | > 5 levels |
| **Circular deps** | 0 | Any |
| **Test coverage** | > 70% for critical paths | < 50% |
| **Unused exports** | 0 | Many |

## Questions to Ask
- "If I need to change X, how many files do I need to touch?"
- "Can a new developer understand this module in under 10 minutes?"
- "Can I test this in isolation?"
- "What would happen if we need to replace this dependency?"
- "Is the naming consistent with the project conventions?"
