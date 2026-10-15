# PRD · APP-081: Mobile Agent Chat Web Parity

> Product Requirements · WHAT and WHY. The phone Agent Chat looks and behaves like the web Agent Chat: same message rendering, same part tree, same card set, same input, same motion. One mobile exception: one card above the input at a time.

## Context

- **Problem**: [APP-079](../APP-079_mobile-agent-chat/PRD.md) delivered the same conversation, not the same UI. On the phone, tool and thinking details live in bottom sheets, nothing animates, there is no activity indicator or scroll-to-bottom button, and only two kinds of cards appear above the input. A builder comparing the same chat on web and phone sees two different products. The audit is in [BRAINSTORM](./BRAINSTORM.md) (ids `G-01`…`G-31`).
- **Why now**: The web chat just settled (QUALITY-006 identity model, QUALITY-008 virtual list + stream pacing). The phone consumes the same wire and fold, so the remaining gap is rendering. Atmos has no users yet, so there is no compatibility burden on the old phone UI or protocol.
- **Related specs**: Baseline [APP-079](../APP-079_mobile-agent-chat/PRD.md). Part tree and idempotent events [QUALITY-006](../QUALITY-006_agent-event-identity/TECH.md). Stream and virtual list [QUALITY-008](../QUALITY-008_agent-chat-ui-optimization/TECH.md). Chat product [APP-067](../APP-067_atmos_agent_abs/PRD.md), [APP-068](../APP-068_agent_chat_arch_optimize/PRD.md), [APP-069](../APP-069_agent_chat_hits_and_session_ops/PRD.md).

### Spec relationship: APP-081, not an APP-079 appendix

- `specs/APP/` ends at `APP-080`; no `APP-081` exists in the tree or in any open PR. `specs/AGENTS.md` §2 says to take the next monotonic number and never renumber a published spec.
- APP-079 is a delivered functional spec with its own `PROGRESS.md` / `REVIEW.md` history (S0–S8 implemented, REV-004 open). Its PRD **M7** and TECH explicitly chose "same information and order, mobile chrome", tool details in sheets, and "do not port the web chrome". This spec reverses those display decisions. Folding that into APP-079 would rewrite settled requirements, which §9 forbids.
- Therefore: new spec APP-081; APP-079 is unchanged except one appended note saying APP-081 supersedes its transcript-display decisions. REV-004 (live side-by-side) is absorbed by APP-081 TEST.

## Goals

1. Primary — For the same chat, the message list on the phone and on web show the same parts in the same order with the same grouping, folding, labels, and durations.
2. Primary — Streaming looks the same: paced text, block caret, part reveal, activity indicator, shimmer, tree draw-in, collapse-on-settle.
3. Primary — Scrolling behaves the same: bottom stick while streaming, no jump while reading upward, scroll-to-bottom with a "N below" count, edge fades, bottom padding that clears the cards.
4. Primary — The cards above the input are the same set as web, shown one expanded card at a time, with every card also reachable as a glass title pill in a scrollable row above the input (mobile exception).
5. Primary — The input exposes the same capabilities as the web composer and keeps the phone's native input and glass controls.
6. Secondary — Parity is provable: shared pure rules, a fixture-driven web-vs-phone comparison, and downloadable iOS simulator screenshots and recordings.

## Users & Scenarios

- **Primary persona**: AruNi and other builders who run Atmos on a Computer and use Agent Chat on web and on the phone.
- **Scenario 1**: Open a finished multi-tool turn on web, then the same chat on the phone. Both show "Worked for 42s ›", collapsed; expanding shows the same tree of grouped tools, thinking, and rows.
- **Scenario 2**: Send a prompt from the phone. The sent message anchors, the activity indicator appears under it, thinking shimmers, tool groups draw in, the answer streams with a caret, then the process folds into "Worked for …".
- **Scenario 3**: Scroll up during streaming. The view does not jump. A "3 below" pill appears at the left end of the button row above the input; the card pills scroll independently to its right. Tapping it returns to the end and the pill disappears.
- **Scenario 4**: The agent asks for permission while a plan and a queued prompt exist. One card is expanded; the other two are glass pills in the row above the input, showing their titles. Tapping "Queue" expands that card and collapses the permission card; its pill stays in the row.

## Functional Requirements

### Must Have

- **M1 — Message rendering parity (G-01…G-03, G-08…G-10).**
  - User messages: full-width secondary bubble with web's radius and padding; tap toggles the meta row (time, copy); long text collapses with a fade and a toggle; attachments render as chips; a pending echo is dimmed and reconciles with the server row.
  - Assistant messages: same column width rule, answer text through the phone markdown renderer styled to the web prose scale, block caret while a text part is open, footer after settle (copy, usage badge, worked-for ↔ clock), turn file-changes summary, inline subagent task panel.
  - Session lifecycle, config change, hint, error, and historic permission parts render with the same icon, tone, and copy as web.
- **M2 — Part tree and folds (G-04…G-07, G-11, G-21).**
  - Process fold ("Worked for X"), tool groups, thinking, and subagent wait follow the same segmentation and settle rules as web, including density `compact` as the default.
  - Groups and tool rows expand **inline** with the web tree (branch lines); the bottom sheet is no longer the way to read tool output.
  - Tool bodies cover every web kind: command output, code/path preview, diff, web search, image output, plan document, subagent card, generic.
  - Expand state is stored outside the list, keyed like web, and survives row recycling.
- **M3 — Motion parity (G-12, G-13, G-14, G-16).** Part reveal, tree draw-in, chevron rotation, shimmer, activity indicator, worked-for swap, overlay fade, and sliding numbers use web's durations and easing. Reduced Motion turns all of them off, as on web. Effects with no native equivalent use a documented fallback, listed in TECH "Deviation register"; a fallback is never silent.
- **M4 — Stream pacing (G-15).** Live text passes through the same display buffer rules as web (56 ms commit, flush on turn end, stop, error, reduced motion).
- **M5 — Scroll behavior (G-17…G-20, G-22).** Bottom stick during streaming; no resize-driven jump while reading upward; scroll-to-bottom pill with "N below", pinned at the left end of the glass button row above the input (not a floating button); top and bottom edge fades; bottom padding equals base padding plus the card lane height, easing when it shrinks; own-send anchoring; the Messages header sheet stays.
- **M6 — Cards above the input (G-23…G-25).**
  - Card set equals web's: permission, session operation, plan, background commands, queued prompts, subagent tasks, goal, workflow, context usage. Subagent conversation overlay is out of the must-have set.
  - **A horizontally scrollable row of glass pill buttons sits directly above the input.** Each available card has one pill showing only its title. Tapping a pill expands that card; tapping the expanded card's pill again collapses it. The expanded card renders above the row (confirmed by AruNi, 2026-10-15).
  - **At most one card is expanded at a time.** Expanding another card collapses the previous one; its pill stays in the row.
  - **The scroll-to-bottom pill is part of the same row, pinned as the leftmost item.** It stays in place while the card pills scroll. It is not a card: it never expands anything and does not count toward the one-card rule. It shows when the transcript is not at its end; with unread rows below it reads "N below"; tapping it scrolls to the end and resumes bottom-stick. When there is nothing to show (no cards, at the end) the row is not rendered.
  - A new permission or session-operation request takes the visible slot automatically (it blocks the agent). When it is answered, the slot returns to the card the user last chose, otherwise nothing is expanded.
  - Cards keep the phone's existing card style (`cardElevated`, hairline `glassBorder`, radius 16). Pills are `GlassPanel` capsules. Fade in and out only (180 ms), no slide or scale, as on web.
  - Permission card content matches web: questions, plan todos, plan-exit intent and file path, option kinds. Queue card supports edit, reorder, remove, as on web.
- **M7 — Composer parity (G-26, G-28).** Same capabilities as the web composer: attachments, paste handling, slash and `@` suggestions, mode / permission / model / thinking / fast / context options, context-usage trigger and card, queue / steer / stop while busy. Controls stay native (filled input, glass buttons, native sheets) per `agents/references/design/mobile.md`.
- **M8 — No logic drift (G-29, G-30).** Segmentation, settle, density, timing, motion constants, and copy strings come from shared code or are asserted equal to web in tests. A token mapping table (web token → phone token) is part of TECH and is tested for presence.
- **M9 — Verified, with evidence (G-31).** Delivered with: fixture-driven web-vs-phone comparison, Linux preview pass, and a GitHub Actions macOS iOS-simulator run that uploads screenshots and recordings as artifacts. Anything not verified is listed as not verified.

### Nice to Have

- **N1**: New-chat landing hero (logo, centered composer, slide to dock) like `AgentChatComposerDock` (G-27).
- **N2**: Subagent conversation overlay.
- **N3**: Density setting (`compact` / `standard` / `detailed`) in phone settings.
- **N4**: Android screenshot pass in CI.

## Allowed phone deviations

Parity is "same product, native client". These are intentional and must be listed in the PR description:

- Pointer-only affordances (hover rail, hover swap of worked-for ↔ time) become tap or long-press.
- The right file directory and editor routes stay out (APP-079 M6); paths are shown as chips that do not navigate.
- Effects with no iOS/Android primitive (CSS `blur()` filter, `mask-image`) use opacity + translate + height fallbacks (TECH).
- The composer keeps native glass controls and the keyboard-lift behavior; it does not copy web button chrome.
- Single-card rule and pill row (M6): web stacks cards and floats a centered scroll button; the phone shows one expanded card, a scrollable pill row, and the scroll-to-bottom pill pinned left in that row.

## Out of Scope

- Web or Desktop UI changes. The only permitted `apps/web` edits are import-path swaps if the shared-logic extraction is approved (TECH decision D2).
- New `WsAction`s, REST, or protocol changes.
- Backward compatibility with the previous phone transcript UI.
- Right file directory, code editor, diff editor, terminal mosaic.
- Chat session list screen and workspace/session home screens.
- Microphone / dictation / voice input in the composer (AruNi, 2026-10-15). The reference image shows a microphone beside "Follow up…"; it is not built and not tested.
- Pixel-identical fonts: iOS system fonts vs web fonts. Parity is layout, spacing scale, color roles, copy, and motion.

## Success Metrics

- Leading: for every fixture in the TEST fixture set, the structural comparison (part order, grouping, labels, expanded/collapsed state) has zero mismatches between web and phone.
- Leading: the iOS simulator job produces screenshots and recordings for all fixtures, in light and dark, and they are downloadable from the PR's workflow run.
- Qualitative: AruNi reviewing web and phone screenshots of the same fixture calls them "the same chat".

## Risks & Open Questions

- **Risk**: Web effects without an RN primitive (blur, mask, shimmer) look different. Mitigation: deviation register; side-by-side recordings expose the delta honestly.
- **Risk**: Large UI port inside one PR. Mitigation: slice plan in TECH; each slice typechecks and ships fixtures.
- **Risk**: A real iOS simulator run costs macOS minutes. Mitigation: manual or label-triggered workflow; Linux preview for the inner loop.
- **Open**: Pixel details of the reference image (图一): pill height, icon use, spacing, active style. The image file was not readable on the box; the interaction was taken from AruNi's description.
- **Confirmed (AruNi, 2026-10-15)**: the expanded card sits above the pill row; the microphone is out of scope.
- **Open**: Approval to touch `apps/web` import paths (shared extraction), density setting, pill priority rule (see BRAINSTORM "Forks").

## Milestones

- Phase 0 — Specs reviewed (this directory); shared pure logic extracted or parity-tested (S0).
- Phase 1 — Fixtures and comparison harness (S1) so every later slice has a before/after.
- Phase 2 — Transcript parts, inline tree, expand store, motion (S2–S4).
- Phase 3 — Scroll and list behavior (S5).
- Phase 4 — Card lane and card contents (S6).
- Phase 5 — Composer parity (S7).
- Phase 6 — macOS simulator workflow, artifacts, evidence report (S8).
