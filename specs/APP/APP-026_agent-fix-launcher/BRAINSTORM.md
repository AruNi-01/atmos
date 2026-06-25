# Brainstorm · APP-026: Agent Fix Launcher

> Skipped by request. Product direction is already settled enough to write the PRD, TECH, and TEST documents directly.

## Decision Snapshot

- Build a reusable Agent Fix capability for prompt-backed repair actions across Atmos Web/Desktop.
- Provide both a bottom toolbar variant and a compact action-button variant.
- Reuse the existing terminal-agent picker and run-config controls from APP-024 rather than creating a new agent settings UI.
- Launch Agent Fix runs in a new terminal tab whose title can be customized by the calling surface.
- Keep prompt generation and domain-specific lifecycle updates owned by each source feature.

See [PRD.md](./PRD.md), [TECH.md](./TECH.md), and [TEST.md](./TEST.md) for the active spec.
