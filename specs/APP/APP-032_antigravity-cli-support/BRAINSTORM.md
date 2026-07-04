# Brainstorm · APP-032: Antigravity CLI Support

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

Google Gemini CLI (`gemini` command) has migrated to Antigravity CLI (`agy` command). To align with this change and provide support for Google's agent development ecosystem, Atmos needs to add built-in support for the Antigravity CLI. 

At the same time, we must preserve the existing Gemini CLI support without touching or breaking it, allowing both CLI agents to coexist.

## Goals (draft)

- Provide parallel support for Antigravity CLI (`agy`) alongside Gemini CLI (`gemini`).
- Make Antigravity a built-in agent available in Code Agent settings and presets.
- Support status monitoring and hooks management for Antigravity.
- Incorporate Antigravity CLI credential/auth detection in AI Quota Usage.

## Options

### Option A — Complete replacement of Gemini with Antigravity
Rename all code paths, databases, settings, and endpoints from "gemini" to "antigravity".

- **Pros**: Cleaner codebase; no legacy Gemini CLI stuff to maintain.
- **Cons**: Breaks backward compatibility. The user explicitly requested not to touch the previous Gemini CLI integration ("之前的也先别动").

### Option B — Coexisting Parallel Support (Proposed)
Add Antigravity CLI as a first-class agent alongside Gemini CLI. Share standard fallback adapters where appropriate, but define separate agent structures, hook modules, endpoints, and status trackers.

- **Pros**: Safe, compliant with user instructions, zero risk of breaking existing Gemini workflows.
- **Cons**: Minor code duplication in hook routing and registration.

## Key forks in the road

- **Fork 1: CLI and Desktop Quota merging**: Antigravity has both a Desktop application (already defined as `antigravity` provider in AI usage) and a CLI agent (`agy`). Should we create a separate `antigravity_cli` provider for AI usage, or extend the existing `antigravity` provider to support both Desktop live-fetching and CLI credentials (from `~/.gemini/antigravity-cli/settings.json`)?
  - *Decision (TECH)*: Extend the existing `antigravity` provider spec. Since `detect_auth` checks both CLI settings paths/env keys and Desktop endpoints, merging them into one provider matches the unified branding of "Antigravity" and simplifies the UI.
- **Fork 2: CLI Executable configuration**: Antigravity CLI executable is `agy`. Should we allow users to customize this, or lock it as built-in?
  - *Decision (PRD)*: Configure it as a built-in agent with `agy` as command, but standard workspace settings allow customizing arguments/paths just like other built-in agents.

## Open questions

- [ ] Does Antigravity CLI support the exact same `stream-json` stdout output format as Gemini CLI?
  - *Answer*: Yes, we will configure its built-in parameters to use `--yolo --output-format stream-json --prompt` and use the `cursor_stream_json` stdout parser.
- [ ] What is the settings directory for the Antigravity CLI hooks?
  - *Answer*: Based on doc sitemap/references, settings are at `~/.gemini/antigravity-cli/settings.json`. Hooks are managed under the `hooks` object in this file.

## References

- Antigravity CLI Reference: [references/cli.md](file:///Users/aarynlu/.gemini/antigravity/builtin/skills/antigravity_guide/references/cli.md)
- Existing Gemini CLI hook: [gemini.rs](file:///Users/aarynlu/.gemini/antigravity/worktrees/atmos/add-antigravity-cli-support/crates/core-engine/src/agent_hooks/gemini.rs)
- Existing Gemini AI usage: `crates/ai-usage/src/runtime.rs`

## Ready to promote

- Promote to PRD: Coexisting parallel support, built-in registration, hooks implementation, settings integration.
- Promote to TECH: Enum upgrades (`AgentId`, `AgentToolType`), hook routes `/hooks/antigravity` and status managers, frontend store integrations.
