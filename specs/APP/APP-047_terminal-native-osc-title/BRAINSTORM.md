# Brainstorm · APP-047: Terminal Native OSC Title

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

Agent CLIs (Codex, Claude Code, Grok Build, OpenCode, etc.) emit standard terminal title sequences (**OSC 0 / OSC 2**) to name the host tab after the current session topic (e.g. `debugging auth`, spinners, action-required prefixes). Atmos today only consumes the product shim channel **OSC 9999** (`CMD_START` / `CMD_END`) for activity titles and agent detection. Native OSC titles are parsed by xterm.js but never surface in the Atmos pane toolbar, so multi-agent panes stay labeled only by brand / cwd / command.

Users already have custom pane names (`customLabel`, APP-033). Those must remain the highest-priority display source and must not fight with agent OSC titles.

## Goals (draft)

- Surface agent-emitted native OSC titles in the Atmos pane toolbar as a **suffix**.
- Keep Atmos agent detection / brand icons driven only by shim activity + known agent identity (never by OSC text).
- When the user has set a custom pane title, **do not** show the OSC suffix.
- Zero backend / persistence work if possible (transient display state, like `dynamicTitle`).

## Options

### Option A — Append OSC title with `|` after auto title
Capture OSC 0/2 via xterm `onTitleChange`, store as `oscTitle` on the pane, compose:

```
display = autoDisplayTitle + (oscTitle && !customLabel ? ` | ${oscTitle}` : "")
```

Agent detection unchanged. Clear `oscTitle` on empty OSC payload and on shim `CMD_END` (shell idle).

**Pros**: Matches user request; low risk; orthogonal to APP-003 / APP-033.  
**Cons**: Busy agents that re-assert titles frequently may re-render toolbar text (mitigate with sanitize + dedup).  
**Unknown**: Whether scoped wiki/code-review panes need the same wiring in v1.

### Option B — Replace auto title with OSC title when present
When OSC title arrives, use it as the whole pane title (still keep agent icon from detection).

**Pros**: Closer to native terminal tab behavior.  
**Cons**: Loses Atmos brand/command context users rely on; fights with dynamic cwd; harder with custom names.  
**Unknown**: How often OSC titles are noise (version strings, spinners).

### Option C — Independent status chip / tooltip only
Show OSC title in a tooltip or secondary chip, never in the main toolbar string.

**Pros**: Toolbar stays short.  
**Cons**: Easy to miss; more UI surface; not what the user asked for.

## Key forks in the road

- **Fork 1**: Append vs replace — **append with `|`** (Option A). Decide locked for PRD.
- **Fork 2**: Clear policy — clear on empty OSC + CMD_END vs leave until next OSC. Prefer **clear on empty + CMD_END**.
- **Fork 3**: Mobile parity in v1 vs web-first. Prefer **web + shared helper + mobile if same OSC path is cheap**.
- **Fork 4**: Persist `oscTitle` — **no**, display-only like `dynamicTitle`.

## Open questions

- [x] Separator character: `|` with spaces → ` | `
- [x] Custom title suppresses OSC entirely (even Keep Agent / Keep CWD suffixes)
- [x] OSC text never drives `resolveAgentForTitle` / `setPaneAgent`
- [x] Max length for OSC suffix — **resolved: 64 char hard cap without ellipsis** (`MAX_NATIVE_OSC_TITLE_CHARS = 64`)

## References

- Existing shim titles: `specs/APP/APP-003_web-terminal-dynamic-title/`
- Custom naming: `specs/APP/APP-033_terminal-custom-naming/`
- Shared composition: `packages/shared/src/terminal/title.ts`
- Capture site: `apps/web/src/features/terminal/components/Terminal.tsx` (OSC 9999 only today)
- Toolbar merge: `apps/web/src/features/terminal/hooks/use-terminal-toolbar-title.ts`
- External: Codex `terminal_title.rs` emits OSC 0; Claude Code issues document OSC 0/2 host titles

## Ready to promote

- Promote to PRD: Option A append semantics, custom-label suppression, agent-detection invariance.
- Promote to TECH: xterm `onTitleChange`, `oscTitle` pane field, `getTerminalDisplayMeta` extension, clear rules, tests.
