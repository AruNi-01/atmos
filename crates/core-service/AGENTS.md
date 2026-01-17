# Core Service Layer - AGENTS.md

> **🧠 L3: Business Rules**: This is where the actual "Vibe Habitat" logic lives. It coordinates Infra and Engine to fulfill user intents.

---

## 📁 Directory Structure

```
crates/core-service/
├── src/
│   ├── auth.rs              # Identity & Access logic
│   ├── project.rs           # Project lifecycle
│   ├── workspace.rs         # Development environments
│   ├── terminal.rs          # UI-Backend terminal bridge
│   ├── types.rs             # Business Models (Shared with API)
│   └── error.rs             # Domain Errors
└── README.md
```

---

## 🛠 Working Guidelines

### 1. Service Traits
- Define service behavior using async traits for better testability (mocking).

### 2. Business Rules
- Keep rules pure. E.g., `validate_project_name` should be a pure function or a service method with no side effects.

### 3. Orchestration
- Services should combine multiple L1/L2 calls. 
- E.g., `create_workspace` calls `infra` to save metadata and `engine` to init git.

---

## 🚦 Interaction Rules
- **DO**: Use `infra` repos and `engine` managers via dependency injection.
- **DON'T**: Perform raw HTTP handling or SQL queries directly. Use the abstractions.

---

## 🧪 Testing
- Unit test business logic extensively using mocks for Infra/Engine.
