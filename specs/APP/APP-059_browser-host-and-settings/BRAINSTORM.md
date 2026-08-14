# Brainstorm · APP-059: Browser Use experience kernel

> Problem space. The Settings page and agent-opened tabs are **one** surface of a larger leap: unified agent contract, first-success without ritual, and human→agent handoff.

## Context

Hardening made Browser Use **correct**. It is still not **pleasant**:

1. Agent learns two backends, two snapshot names, two loops (`prepare` then bind `state` then snapshot `state`).
2. First refs take three round-trips even when a Browser tab is already on screen.
3. User pick/annotate is a side channel (`user_picks`) the model must be taught to read.
4. If no chrome is mounted, the agent cannot open one; placement (sidebar vs center) is implicit.

(4) is the new product capability. (1)–(3) are the experience lift called out after hardening. This spec does **all four**. Shipping only (4) is not “optimal UX”.

## Goals (draft)

- One agent-facing `state` envelope and one skill loop. Backends stay two runtimes; the CLI hides the split.
- First Desktop embedded success is one `state` (or one `tabs open`). No mandatory `prepare`. No bind-only `state` when a host is already resolvable.
- User highlights become the first `elements[]` on the next `state`. No second API.
- User setting owns sidebar vs center; agent can ensure that chrome when none exists.

## Options (experience kernel)

### Unify — A: Fake one snapshot format
Map embedded DOM onto `semantic_v2`.

**Rejected**: lies about engine contract; breaks continuation / roles.

### Unify — B: CLI envelope + capability_flags (locked)
Same JSON shape for `state` on both backends: `elements[]`, `truncated`, `total_candidates`, `capability_flags`. Honest `snapshot_format`. Skill is one procedure.

### First success — A: Keep prepare + bind + snapshot
**Rejected**: that is today’s ritual.

### First success — B: Resolvable host ⇒ snapshot now (locked)
No target + last-active or unique guest → return a **snapshot**, not a bind list. Zero hosts → ensure default surface, then snapshot. `prepare` remains for external / capability probe only.

### Handoff — A: Teach `user_picks` in the skill
**Rejected**: second channel, models miss it.

### Handoff — B: Picks are the snapshot (locked)
On pick, mark last-active and refresh the snapshot cache. Next `state` prepends live highlights as normal refs. Skill never says “read `user_picks`”.

### Placement — user setting, not `--surface` (locked)
See PRD M1–M7. Agent does not choose chrome.

## Key forks

- Unify by **envelope**, not by faking `semantic_v2` — PRD.
- Bind-mode `state` **dies** for the common path — TECH.
- `user_picks` may remain as a compatibility alias; it is not the agent API — PRD.
- Settings / ensure is required, not a substitute for (1)–(3) — PRD.

## References

- Hardening: binding lifecycle, last-active host, query/truncated, renderer-owned tabs.
- Chrome: `RightSidebar.tsx`, `use-browser-center-tabs.ts`, `BrowserPanel.tsx`.
- APP-052 (no MCP), APP-053 (webview), APP-041 (cookies).

## Ready to promote

All four pillars are Must Have in one ship: unify, first success, handoff, host+settings.
