# APP-047 · Terminal Native OSC Title — PRD

> **WHAT & WHY.** Surface standard OSC 0/2 titles emitted by agent CLIs as a pane-toolbar suffix, without changing agent detection or overriding user custom names.

Related: [APP-003 Web Terminal Dynamic Title](../APP-003_web-terminal-dynamic-title/TECH.md), [APP-033 Terminal Custom Naming](../APP-033_terminal-custom-naming/PRD.md).

---

## 1. Users & motivation

Developers run multiple agent sessions (Codex, Claude Code, Grok Build, …) in Atmos panes. Agents already write meaningful session topics to the **host terminal title** via OSC 0/2, but Atmos pane toolbars ignore that channel and only show brand / command / cwd from the Atmos shim. Users cannot tell which pane is “auth debugging” vs “rate limit fix” at a glance.

## 2. User stories

- As a user, when an agent sets a native terminal title, I see it **after** the Atmos auto title, separated by ` | `.
- As a user, the pane still shows the correct **agent icon / brand** from Atmos detection; OSC text never rebrands the pane as a different agent.
- As a user, if I set a **custom pane title** (APP-033), OSC suffixes are hidden so my label stays clean.
- As a user, when the agent exits (shell returns to prompt) or the process clears the title, the OSC suffix disappears.

## 3. Functional requirements

### Must have

- **M1 — Capture native OSC titles.** Atmos xterm instances handle standard window-title sequences (OSC 0 and OSC 2, as exposed by xterm.js `onTitleChange`) and store a sanitized `oscTitle` per pane.
- **M2 — Append display.** When `oscTitle` is non-empty and the pane has **no** user `customLabel`, the toolbar title is:

  ```
  {autoDisplayTitle} | {oscTitle}
  ```

  If `autoDisplayTitle` is empty, show only `{oscTitle}`.
- **M3 — Agent detection unchanged.** `resolveAgentForTitle` / `setPaneAgent` continue to use only shim `dynamicTitle` (and existing base/agent fields). Native OSC text is never used for agent matching.
- **M4 — Custom title suppresses OSC.** A non-empty pane `customLabel` means OSC is not appended (regardless of Keep Agent Name / Keep CWD).
- **M5 — Clear rules.** `oscTitle` is cleared when:
  - an empty/whitespace-only native title is received, or
  - the Atmos shim emits `CMD_END` (shell idle).
- **M6 — Persist meaningful OSC.** Unlike shim `dynamicTitle` (restored via tmux inject on attach), agent session OSC titles are written into the terminal layout document so a full page refresh restores `{agent} | {topic}`. Shell host/path noise is never stored. Saves use the existing debounced layout save path.
- **M7 — Dedup / sanitize.** Strip control characters and collapse whitespace before display; skip store updates when the sanitized value is unchanged.
- **M8 — Filter noisy / redundant OSC.** Do **not** append OSC when it is:
  - shell noise: `user@host:cwd`, host-prefixed paths, or path-only titles (Atmos already shows path via shim);
  - agent-redundant: equals the detected agent's command / aliases / label / id (e.g. OSC `claude` while the toolbar already shows the Claude brand), or equals the current shim `dynamicTitle`.
  Meaningful session topics (e.g. `debugging auth`) still append.

### Should have

- **S1 — Cap suffix length** so toolbars stay scannable (hard-capped at 64 chars, no ellipsis — matches `MAX_NATIVE_OSC_TITLE_CHARS`).
- **S2 — Mobile parity** when the mobile xterm path can register the same handlers with low cost.
- **S3 — Scoped panes** (wiki / code review) that already show dynamic titles get the same append behavior.

### Won't have (v1)

- Replacing the entire Atmos title with OSC text.
- Persisting OSC titles across refresh.
- Using OSC titles for tab-bar `customTitle` (tab rename remains APP-033 only).
- Parsing proprietary OSC codes beyond what xterm maps to `onTitleChange`.
- Backend protocol or WebSocket changes.

## 4. Display precedence

```
if customLabel?.trim():
    display = APP-033 custom composition   # no OSC suffix
else:
    auto = getTerminalDisplayMeta(... dynamicTitle / agent ...)  # unchanged
    if oscTitle:
        display = auto.displayTitle
            ? `${auto.displayTitle} | ${oscTitle}`
            : oscTitle
    else:
        display = auto.displayTitle

toolbarAgent = auto.toolbarAgent   # never derived from oscTitle
```

## 5. Success criteria

- Running Codex/Claude (or any CLI that writes OSC 0/2) shows a `|` suffix on the pane toolbar while the process is active.
- Detected agent icon/label still matches Atmos detection for that pane.
- Setting a custom pane name hides the suffix immediately (or on next render).
- After the agent exits and shim `CMD_END` arrives, the suffix is gone.

## 6. Non-scope

See §3 “Won't have”. No REST endpoints; no layout schema migration.
