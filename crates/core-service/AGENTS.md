# Core Service Layer (L3) - AGENTS.md

> **🧠 L3: Business Rules**: This crate implements the core business logic of Vibe Habitat.

## Core Logic
- **Auth**: Logic for validation and token issuance.
- **Project/Workspace**: Orchestrating Engine and Infra to manage development environments.
- **Terminal**: High-level terminal session orchestration.

## Working Patterns
- **Orchestration**: Services should call multiple Engines (L2) and Repos (L1) to fulfill a business goal.
- **Type Safety**: Use `types.rs` for domain-specific models used across services.
