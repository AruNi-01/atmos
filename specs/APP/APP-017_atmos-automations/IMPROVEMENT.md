# IMPROVEMENT · APP-017: Atmos Automations — Operational Log

> Living record of production issues, quality gaps, mitigations shipped, and follow-ups. Complements the frozen planning quartet ([BRAINSTORM](./BRAINSTORM.md) → [PRD](./PRD.md) → [TECH](./TECH.md) → [TEST](./TEST.md)); does not replace them.

**Related code**: `apps/web/src/features/automations/components/AutomationSetup.tsx`, `apps/web/src/features/automations/components/AutomationSetupControls.tsx`, `apps/web/src/features/welcome/components/WelcomeComposerCard.tsx`, `apps/web/src/features/welcome/components/WelcomeComposerControls.tsx`

---

## How to use this file

| Rule | Detail |
|------|--------|
| **When to add** | After fixing a user-reported bug, reliability issue, quality regression, agent ergonomics gap, or deliberate product parity gap. |
| **Entry id** | `IMP-NNN` — zero-padded, monotonic in this file (next: **IMP-005**). |
| **Status** | `open` → `mitigated` → `closed` (or `wont-fix` with reason). |
| **Do not** | Duplicate full TECH sections; link to TECH/PRD and paste only deltas. |
| **Versions** | If agent-facing behavior changes, note the relevant Skill / CLI / runtime version in the entry. |

---

## Index

| Id | Title | Status | Date |
|----|-------|--------|------|
| IMP-001 | Restore welcome-composer automation setup | mitigated | 2026-05-28 |
| IMP-002 | Fill headless defaults for Kilo and Kimi | mitigated | 2026-05-28 |
| IMP-003 | Expose schedule timezone in trigger composer | mitigated | 2026-05-28 |
| IMP-004 | Scope automations composer commands to automation context | mitigated | 2026-05-29 |

---

## IMP-001 · Restore welcome-composer automation setup

| Field | Value |
|-------|--------|
| **Date** | 2026-05-28 |
| **Status** | mitigated |
| **Reported by** | user |
| **Severity** | ergonomics |

### Problem

The create automation page drifted from APP-017's setup requirement. Instead of using the welcome page's full-screen composer-style UI with automation-specific copy, it rendered a conventional multi-section form with separate cards for display name, agent, instructions, environment, and trigger. This made the flow visually inconsistent with the requested setup pattern and hid the intended "compose first, configure through compact controls" interaction.

### Root cause

The implementation reused the welcome `PromptComposer`, but not the welcome composer shell and control-row interaction model. Automation-only fields were laid out as full form sections instead of being exposed through compact controls with popover editors.

### Solution

Restore the setup UI to the welcome page pattern: automation-specific dynamic headline copy with the ATMOS wordmark, welcome-style composer card, floating agent selector, and an automation footer row whose buttons open Atmos-surface popovers for display name, run environment, and trigger configuration. Keep the submit affordance as a Timer icon inside the composer surface and keep backend request shape unchanged.

Refine the trigger editor so trigger kind is selected from a single select control first; only the remaining fields for the selected trigger kind are shown below it.

Update the built-in Droid automation command to use Factory's headless `droid exec --skip-permissions-unsafe` mode, so installed Droid CLIs are treated as automation-capable and match the yolo/bypass behavior used by the other built-in automation agents.

### Result

Mitigated in the web UI. The create/edit automation setup now uses the welcome-style full-screen composer shell, automation-specific dynamic headline copy, a floating reused agent selector, the reused prompt composer, and compact footer popover controls for display name, run environment, and trigger configuration. Browser DOM smoke verified that the Name, Environment, and Trigger popovers open and update visible setup state.

### Code / docs touched

- `apps/web/src/features/automations/components/AutomationSetup.tsx`
- `apps/web/src/features/automations/components/AutomationSetupControls.tsx`
- `apps/web/src/features/welcome/components/WelcomeComposerControls.tsx`
- `apps/web/src/features/welcome/components/WelcomeComposerCard.tsx`
- `apps/web/src/features/welcome/lib/welcome-page-helpers.tsx`
- `apps/web/src/app-shell/LeftSidebarManagementCenter.tsx`
- `apps/web/src/app-shell/global-search-app-items.tsx`

### Follow-ups

- [ ] Capture a visual screenshot once Browser screenshot capture is available for this page.
- [x] Verify every required automation field is reachable from the compact control row.

---

## IMP-002 · Fill headless defaults for Kilo and Kimi

| Field | Value |
|-------|--------|
| **Date** | 2026-05-28 |
| **Status** | mitigated |
| **Reported by** | user |
| **Severity** | integration correctness |

### Problem

Kilo Code and Kimi were listed as built-in terminal agents but had empty default automation flags, so the automation capability resolver classified them as unsupported even though their current CLIs document non-interactive execution modes.

### Root cause

The shared terminal-agent manifest had not been refreshed after Kilo and Kimi added/documented headless modes. Since the resolver treats empty built-in flags as "not automation-capable", both agents were blocked before installation status or prompt strategy could matter.

### Solution

Update Kilo Code to use `kilo run --auto --dangerously-skip-permissions` and Kimi to use `kimi --print -p`. Kimi uses the `prompt_flag` strategy so the automation runner passes the prompt after `-p`, matching the CLI documentation. Extend the built-in command-spec regression test so both invocations stay covered.

### Result

Kilo and Kimi now have non-empty headless defaults in the shared manifest. Installed CLIs can be surfaced as automation-capable unless the user overrides those built-ins with custom flags or disables the agent.

---

## IMP-003 · Expose schedule timezone in trigger composer

| Field | Value |
|-------|--------|
| **Date** | 2026-05-28 |
| **Status** | mitigated |
| **Reported by** | user |
| **Severity** | scheduling ergonomics |

### Problem

Automation schedules already carry a timezone through the frontend request and Rust scheduler, but the create/edit composer did not expose the timezone as an editable control. Users could only accept the browser-detected timezone, making cross-region schedules hard to author.

### Root cause

`AutomationSetup` initialized and persisted timezone state, but `AutomationTriggerPicker` only edited trigger kind and schedule fields. The compact composer footer could display timezone in the summary while the popover had no way to change it.

### Solution

Add a compact timezone select to the right side of the Trigger popover title. Default the selected value to the existing browser-resolved timezone state, enumerate common IANA timezones by region, and include the current timezone at the top when it is not part of the common list.

### Result

Users can now switch the schedule timezone in place while configuring the trigger. Schedule preview and the composer footer summary update through the existing timezone state and backend payload.

---

## IMP-004 · Scope automations composer commands to automation context

| Field | Value |
|-------|--------|
| **Date** | 2026-05-29 |
| **Status** | mitigated |
| **Reported by** | user |
| **Severity** | integration correctness |

### Problem

The APP-017 setup page reused the welcome composer command surfaces too literally. The local Automations flow mixed in welcome GitHub mention expectations even though this setup path should only expose file mentions, and the `/skill` menu listed project-scoped skills from unrelated projects instead of following the currently selected Project or Workspace.

### Root cause

`AutomationSetup` mounted the same mention/slash popovers as the welcome page, while `useWelcomeSlashSearch` loaded a global skill list once and never filtered project-scoped skills by the active automation environment.

### Solution

Keep the `@` mention popover in file-only mode inside `AutomationSetup`, with GitHub issue/PR previews forced off for APP-017. Add project-context filtering to the shared slash-skill search so the Automations setup passes its effective target project id and only sees global skills plus project-scoped skills for that selected Project or Workspace. Treat Standalone as no-project context, which means only global skills remain visible.

### Result

Automations create/edit now behaves like an automation-scoped composer instead of a full welcome-page clone. `@` keeps file suggestions only, without GitHub issue/PR suggestions, and `/skill` updates immediately when the user switches between Project, Workspace, New Workspace, and Standalone targets.

### Code / docs touched

- `apps/web/src/features/automations/components/AutomationSetup.tsx`
- `apps/web/src/features/welcome/components/WelcomeComposerCard.tsx`
- `apps/web/src/features/welcome/hooks/use-welcome-slash-search.ts`
- `apps/web/src/features/welcome/hooks/__tests__/use-welcome-slash-search.test.ts`
- `specs/APP/APP-017_atmos-automations/{PRD,TECH,TEST,IMPROVEMENT}.md`

### Follow-ups

- [ ] Add a browser-level smoke test for the slash popover once the local Playwright/browser harness is in place for Automations.
