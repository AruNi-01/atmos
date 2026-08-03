# PRD · APP-052：Desktop Use

> **WHAT & WHY.** Architecture: [`TECH.md`](./TECH.md). Verification: [`TEST.md`](./TEST.md).

## 1. Summary

Ship **Desktop Use**: an Atmos-owned local capability for **desktop capture**, **inspect** (accessibility / UI tree — primary agent-readable context), and optional **desktop control**, managed from **Settings** and **`atmos desktop-use`**, without MCP and without public third-party branding. AppShot keeps its product surface (records, protocol, pending UI) but obtains pixels via Capture and UI structure via Inspect rather than owning OS shell tools itself.

## 2. Goals

1. One clear product name: **Desktop Use** (not “computer-use”, not nested under APP-016 Computer).
2. Settings → **Desktop Use**: status, control-engine install/stop, OS permissions (reuse AppShot permission UI content).
3. Production AppShot capture goes through Desktop Use Capture.
4. CLI for agents/users: `atmos desktop-use` with status, driver lifecycle, capture, and core drive actions.
5. Zero public vendor branding (no `cua` / `Cua` / `trycua` in help, UI, default errors).

## 3. Users & stories

| As a… | I want… | So that… |
|-------|---------|----------|
| Desktop user | a Settings section for Desktop Use | I can install the control engine and grant permissions in one place |
| AppShot user | capture to keep working after migration | dual-shift / history still produce records |
| Agent operator | `atmos desktop-use` commands | agents can capture/drive without custom MCP config |
| Privacy-conscious user | permissions and engine downloads to be explicit | nothing silent-installs control capabilities |

## 4. Must Have

### 4.1 Naming & boundaries

- **M1** Capability name **Desktop Use**; CLI/process id **`desktop-use`** / **`atmos desktop-use`**.
- **M2** No MCP surface for Desktop Use.
- **M3** No public Cua/trycua branding or cua.ai install CTAs.
- **M4** No semantic change to APP-016 `atmos computer` / Computer / Relay.

### 4.2 Settings

- **M5** Settings modal includes a **Desktop Use** section (sidebar entry under system integration).
- **M6** Section shows runtime/control-engine status; actions for **ensure/install (download)** and **stop** (and uninstall/delete when available).
- **M7** Section embeds **OS permission** management for Screen Recording and Accessibility by **reusing** the AppShot permissions UI content/components.
- **M8** Primary recovery path for missing permissions is **Settings → Desktop Use** (not a dedicated AppShot permissions window). Call sites that previously opened the standalone window open Settings Desktop Use (or equivalent in-app section) instead. Standalone window may remain as a thin redirect shell for old deep links.

### 4.3 Capture + Inspect migration

- **M9** Production AppShot path in `apps/desktop-electron/src/appshot/` does **not** directly invoke `osascript` / `screencapture` / raw AX.
- **M10** **Capture** (screenshot + window identity) goes through Desktop Use Capture.
- **M10b** **Inspect** (accessibility UI tree) is a **first-class Desktop Use capability** (own module/CLI), not folded into Capture. AppShot `context.md` body is primarily Inspect output.
- **M11** AppShot business remains: records under `~/.atmos/appshots/`, `atmos://appshots/{ts}`, pending preview, history.

### 4.4 CLI

- **M12** `atmos desktop-use status`
- **M13** `atmos desktop-use driver ensure|status|stop`
- **M14** `atmos desktop-use capture` (JSON-capable)
- **M14b** `atmos desktop-use inspect --pid …` (accessibility tree JSON-capable)
- **M15** Core `drive` actions: at least `screenshot`, `click`, `type` (and optional `shell` only if TECH keeps it non-colliding with terminal agents; default M1 may omit shell).
- **M15b** **Agent pointer**: when driving the desktop from Atmos Desktop, show a synthetic Agent cursor (move / click pulse / type chip) that does **not** move the user’s system pointer. Default on; toggle + preview in Settings → Desktop Use.
- **M16** User-facing CLI help/errors contain no vendor strings.

### 4.5 Control plane

- **M17** Lifecycle state machine for the optional control engine (not installed → downloading → installed → stopped/ready/failed), patterned after local-model-runtime.
- **M18** Control engine binary (when used) lives under Atmos-managed paths (`~/.atmos/desktop-use/…`); not a user-facing third-party product install.

## 5. Nice to Have

- Trajectory recording UI
- Bounded app allowlists in Settings
- Skill package teaching agents Desktop Use CLI

## 6. Out of scope

- MCP server registration
- Public Cua branding
- Changing Relay/Computer registration
- Vendoring trycua monorepo source
- Remote GUI drive of another Computer over Relay (M1)
- Headless CI requiring live TCC success

## 7. Success metrics

| Metric | Target |
|--------|--------|
| Naming lock | Spec + UI + CLI use Desktop Use / desktop-use only |
| AppShot capture | No direct osascript/screencapture in production appshot capture module |
| Settings | Desktop Use section reachable; permissions reusable component |
| CLI | help + status work offline; ensure dry/not-installed path testable |
| Brand | grep of user-facing surfaces free of cua/trycua |

## 8. Related

- APP-016, APP-021, APP-045 (Desktop Electron)
