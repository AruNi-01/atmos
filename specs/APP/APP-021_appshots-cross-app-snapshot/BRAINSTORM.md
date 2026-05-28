# Brainstorm · APP-021: Appshots Cross-App Snapshot

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

Atmos already runs as a Tauri desktop app with a Rust native layer and a shared local API runtime. That makes it a realistic host for a Codex-style Appshots capability: a user-triggered snapshot of another desktop application's current window, combining screenshot pixels with the operating system accessibility tree.

The key product framing is not "read arbitrary app memory." The useful capability is "capture what the user can inspect through OS permissions and accessibility APIs, persist it as a local timestamped record, and copy a lightweight protocol reference that tells agents where to read the record."

## Goals (draft)

- Let a desktop user capture the current external app state from any app through a native global shortcut.
- Persist accepted captures under `~/.atmos/appshots/records/{timestamp}/` with `snapshot.png`, `context.md`, and `metadata.json`.
- Make the copied format recognizable across Atmos surfaces through a stable `atmos://appshots/{timestamp}` first line plus fixed agent instruction.
- Capture both visual context and semantic UI structure when platform permissions and target app accessibility support allow it.
- Keep the feature explicit, local, and privacy-preserving: no background capture, no silent upload, no password field extraction.
- Start where Atmos can deliver a high-quality first version: macOS desktop, with stable unsupported/fallback behavior on other platforms.

## Options

### Option A - Shortcut plus local record

Register a native global shortcut. When pressed from any app, Atmos captures the focused window, shows a right-top preview popover, and either discards or persists the capture as a local record directory. Clipboard contains only `atmos://appshots/{timestamp}` plus an instruction that points agents at the directory.

**Pros**: Decouples capture from ACP Chat; works anywhere text paste works; stores real images naturally; keeps clipboard small; agent can inspect files directly.
**Cons**: Requires local file retention and delete controls; global modifier-only shortcut may need lower-level native event handling.
**Unknown**: Whether `Fn + Cmd + Option` can be registered reliably without a non-modifier key.

### Option B - Global shortcut first

Register a desktop global shortcut that captures the currently focused app without returning focus to Atmos and immediately persists/copies without showing a preview.

**Pros**: Closest to Codex Appshots behavior; avoids the "Atmos is now foreground" problem.
**Cons**: Adds shortcut registration, conflict handling, settings UI, and more cross-platform variation.
**Unknown**: Whether shortcut conflicts are acceptable for v1 or should be deferred to Settings.

### Option C - Surface-local Appshot chips

Teach selected Atmos composers, starting with the Welcome page composer and Automation setup composer, to detect pasted `atmos://appshots/{timestamp}` protocol text. The UI collapses it into a compact Appshot label like file references and skill chips, while submission keeps the protocol reference and fixed instruction.

**Pros**: Keeps protocol prompt text out of the visible composer; follows existing `@file` and `/skill` chip behavior; sends agents a stable local record reference without visual noise.
**Cons**: Requires tokenization, serialization, deletion, tooltip, and submit-time expansion support in each rich composer.
**Unknown**: Whether the same chip parser should become a shared composer primitive or stay Welcome-specific in v1.

## Key forks in the road

- **Trigger model**: Modifier-only global shortcut vs. fallback configurable shortcut. Decide in TECH after OS validation.
- **Consumption model**: Local record directory is the source of truth; clipboard carries only a protocol reference plus fixed instruction.
- **Platform scope**: macOS desktop is the primary v1 target; Windows/Linux expose unsupported or degraded states until native backends are designed.
- **Screenshot handling**: `snapshot.png` is a canonical file inside each accepted record directory.
- **Persistence**: Use local Appshot record directories, not workspace attachments, for v1.
- **Transport**: Use native Tauri commands/events for local desktop capture and record management.
- **Fallback quality**: Prefer screenshot plus accessibility tree, then screenshot-only, then metadata-only failure messaging.

## Open questions

- [ ] Can `Fn + Cmd + Option` be captured reliably on macOS, or does v1 need a configurable fallback chord?
- [ ] Should auto-accept after 6 seconds show a toast after the preview disappears?
- [ ] Should screenshot-unavailable records use a placeholder `snapshot.png`, or should acceptance require screenshot permission?
- [ ] What is the maximum accessibility tree size that stays useful without flooding the agent prompt?
- [ ] How should hosted web/relay mode message that Appshots require local Desktop runtime?

## References

- Existing desktop native commands: `apps/desktop/src-tauri/src/commands.rs`
- Tauri command registration: `apps/desktop/src-tauri/src/main.rs`
- Desktop runtime bridge: `apps/web/src/shared/lib/desktop-runtime.ts`
- Welcome composer rich-token implementation: `apps/web/src/features/welcome/components/PromptComposer.tsx`
- Welcome submit-time placeholder expansion: `apps/web/src/features/welcome/lib/welcome-page-helpers.tsx`
- Welcome create-workspace submit flow: `apps/web/src/features/welcome/components/WelcomePage.tsx`
- Related specs: `APP-009_desktop-tauri`, `APP-004_local-agent-integration-acp`, `APP-016_atmos-computer`

## Ready to promote

- Promote to PRD: The first shippable version is Desktop-only, user-triggered, and local-record-first, not ACP Chat-specific.
- Promote to PRD: The Appshot protocol text must start with `atmos://appshots/{timestamp}`.
- Promote to PRD: Accepted records use `~/.atmos/appshots/records/{timestamp}/snapshot.png`, `context.md`, and `metadata.json`.
- Promote to PRD: Welcome page and Automation setup composers should detect pasted Appshot protocol text, show a compact label, and submit the protocol prompt instruction.
- Promote to PRD: macOS is the primary v1 platform; Windows and Linux should expose clear unsupported or degraded states until implemented.
- Promote to PRD: Delete from the preview discards without persisting; Copy or 6-second timeout persists and copies protocol text.
- Promote to TECH: Implement capture as a Tauri native command, not as a new loopback REST endpoint.
- Promote to TECH: Normalize platform output into `snapshot.png`, `context.md`, and `metadata.json`.
- Promote to TECH: Extend the shared composer token parser with an Appshot token that displays a label but serializes to a compact token and expands to protocol prompt text at submit time in supported submit flows.
- Promote to TECH: Accessibility traversal must redact secure text fields, cap depth/node count, and avoid logging captured content.
