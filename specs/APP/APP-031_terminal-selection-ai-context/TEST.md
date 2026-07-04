# TEST · APP-031: Terminal Selection AI Context

> Test Plan · how we verify terminal selections as AI Input context and protocol-backed side-chat commands. References PRD APP-031 and TECH APP-031.

## Test strategy

- **Bun unit / component tests**: prove protocol parsing, chip rendering, raw `/side` rejection, prompt expansion, selection truncation, and side-context routing.
- **Bun integration tests**: prove TerminalAgentInputOverlay submit behavior does not send side prompts to the source terminal and does include selected context for normal submits.
- **End-to-end (Playwright)**: cover the critical web journey in `e2e/tests/specs/APP-031_terminal-selection-ai-context.e2e.ts` when the harness can seed terminal output and select text.
- **Exploratory agent-browser**: verify selection toolbar positioning, focus behavior, chip clarity, and Canvas clipping.
- **Manual-only**: exact terminal text selection gestures across browser, desktop WebView, and OS clipboard behavior may need manual smoke because xterm/browser selection behavior can vary.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 | S1, S9 |
| M2 | S1, S2, S8 |
| M3 | S3, S5 |
| M4 | S2, S4 |
| M5 | S5, S6 |
| M6 | S6, S7 |
| M7 | S3, S5 |
| M8 | S2, S8 |
| M9 | S4, S10 |
| M10 | S9 |
| M11 | S11 |

## Execution map

| Scenario | Level | Expected tool | Target command / method | Fixture / data | Signals | Status |
|----------|-------|---------------|-------------------------|----------------|---------|--------|
| S1 | Bun component | `bun test` | `bun test apps/web/src/features/terminal` | terminal with selected text snapshot | toolbar visible; buttons show `MessageCircleMore` and `MessageCirclePlus`; action callbacks receive copied snapshot | planned |
| S2 | Bun integration | `bun test` | `bun test apps/web/src/features/terminal apps/web/src/features/welcome` | selection snapshot and AI Input overlay | `Selection` chip inserted; input focused; final normal prompt contains selected-context block | planned |
| S3 | Bun integration | `bun test` | `bun test apps/web/src/features/terminal` | selection snapshot, side action, fake side agent | side chip inserted; side submit calls `onStartSideChat` with selection context; source send callbacks untouched | planned |
| S4 | Bun unit | `bun test` | `bun test apps/web/src/features/terminal` | selection text containing ANSI/control chars and large content | context text is normalized, bounded, and marked truncated; no logs contain text | planned |
| S5 | Bun unit/integration | `bun test` | `bun test apps/web/src/features/terminal` | side chip referencing terminal selection context | `captureContext` mock is called once; side prompt contains normal bounded capture plus selected context section | planned |
| S6 | Bun component | `bun test` | `bun test apps/web/src/features/terminal apps/web/src/features/welcome` | pasted text containing `/side` | composer sends ordinary prompt; no side chip; no side selector; no `onStartSideChat` | planned |
| S7 | Bun component | `bun test` | `bun test apps/web/src/features/terminal` | slash menu selection for `/side` | slash menu inserts `atmos://side-chat/{context_id}` chip, not raw `/side` | planned |
| S8 | Bun component | `bun test` | `bun test apps/web/src/features/welcome` | composer with selection and side chips | Backspace/Delete removes whole chips; removing selection removes context from final prompt | planned |
| S9 | E2E | Playwright | `just test-e2e -- tests/specs/APP-031_terminal-selection-ai-context.e2e.ts` | local app, seeded terminal output, terminal AI Input available | select terminal text; toolbar appears; Add as context and Side chat for selection work in browser UI | planned |
| S10 | Static/security | `bun test` or lint | `bun test apps/web/src/features/terminal` | side-chat registry mocks and console spies | selected text is not stored in side-chat record, console error, debug log payload, or persisted local registry | planned |
| S11 | Static/i18n | `bun test` or lint | `bun test apps/web/src/features/terminal` | `en.json` and `zh.json` | all new toolbar/chip/error copy keys exist in both locales | planned |

## Scenarios

### S1 - Terminal selection shows toolbar

- **Level**: Bun component
- **Given**: a terminal pane with a non-empty xterm selection.
- **When**: the selection changes.
- **Then**: Atmos renders a compact toolbar near the selected range with `Add as context` and `Side chat for selection`.
- **Signals**: toolbar is inside the terminal surface; `MessageCircleMore` and `MessageCirclePlus` icons are rendered; empty selection hides the toolbar.

### S2 - Add as context inserts Selection chip and expands prompt

- **Level**: Bun integration
- **Given**: selected terminal text `error: missing file`.
- **When**: the user clicks `Add as context`, types `why?`, and submits normally.
- **Then**: AI Input contains a `Selection` chip before submit, and the final sent prompt includes a labeled selected-context block followed by `User prompt: why?`.
- **Signals**: `onSendText` receives expanded selected-context prompt; `onStartSideChat` is not called.

### S3 - Side chat for selection activates side mode without source send

- **Level**: Bun integration
- **Given**: selected terminal text and a runnable side-chat agent.
- **When**: the user clicks `Side chat for selection`, types a question, and submits.
- **Then**: side mode is active through a side chip, `onStartSideChat` receives the typed prompt and selection context, and the source terminal callbacks are not called.
- **Signals**: `onSendText` and `onSendEnter` spies remain untouched; side launch receives one `terminal_selection` context.

### S4 - Selection context is normalized and bounded

- **Level**: Bun unit
- **Given**: selected text with control characters, mixed line endings, and more than the configured byte limit.
- **When**: the context record is created.
- **Then**: the stored text is plain UTF-8, line endings are normalized, byte count metadata is set, and truncation metadata is true.
- **Signals**: no ANSI/control sequences in context text; text length is within limit; omission marker is present.

### S5 - Selection side chat preserves bounded tmux capture

- **Level**: Bun unit/integration
- **Given**: a side command token that references a `terminal_selection` context.
- **When**: `startSideChat` builds the initial side prompt.
- **Then**: Atmos still calls APP-030 bounded tmux capture, and the generated prompt contains both the captured terminal transcript and a separate user-selected terminal context block.
- **Signals**: capture mock call count is one; prompt contains captured context metadata, selected text, and selection metadata.

### S6 - Pasted `/side` remains plain text

- **Level**: Bun component
- **Given**: the user pastes `run /side in this README example` into terminal AI Input.
- **When**: the user submits.
- **Then**: Atmos sends the text to the source terminal as ordinary prompt content.
- **Signals**: no side chip, no side selector, no `onStartSideChat`, source send includes `/side`.

### S7 - Slash menu inserts protocol side chip

- **Level**: Bun component
- **Given**: terminal AI Input with slash popover open.
- **When**: the user selects `/side` from the slash menu.
- **Then**: the composer renders a side chip whose serialized token starts with `atmos://side-chat/`.
- **Signals**: `composerRef.getText()` contains the side protocol token and does not contain raw `/side`.

### S8 - Chip removal updates prompt context

- **Level**: Bun component
- **Given**: a composer with a `Selection` chip and typed prompt.
- **When**: the user presses Backspace/Delete at the chip boundary.
- **Then**: the whole chip is removed and the backing context is not included on submit.
- **Signals**: chip node removed; context registry no longer contributes to resolved prompt.

### S9 - E2E selection journey

- **Level**: E2E (Playwright)
- **Given**: a workspace terminal showing seeded output.
- **When**: the user selects a line, clicks `Add as context`, and submits a normal prompt.
- **Then**: the AI Input shows the `Selection` chip and the source terminal receives the expanded prompt.
- **When**: the user repeats with `Side chat for selection`.
- **Then**: a side chat modal opens and the source terminal does not receive the side prompt.
- **Signals**: toolbar visible, chips visible, side modal visible, source terminal output unchanged for side submit.

### S10 - Selection text is not persisted or logged

- **Level**: Static/security
- **Given**: a selected text value containing a unique sentinel.
- **When**: the side chat record is created and persisted.
- **Then**: the sentinel appears only in the generated side prompt sent to the side terminal, not in side-chat registry payloads or console/debug logs.
- **Signals**: persisted record payload lacks sentinel; console spy lacks sentinel.

### S11 - User-facing copy is localized

- **Level**: Static/i18n
- **Given**: English and Chinese message files.
- **When**: toolbar, chip, tooltip, and error states render.
- **Then**: every user-facing string comes from locale keys available in both files.
- **Signals**: missing-key tests pass; component source has no hardcoded toolbar/chip/error prose except protocol identifiers.

## Performance & load budgets

- Selection toolbar appears within one animation frame after xterm selection change.
- Adding a selection context up to 64 KiB does not block the main thread longer than one animation frame on a typical local development machine.
- Side chat for selection still calls backend capture once and appends selected context without extra backend round trips.

## Regression checklist

- [ ] Raw `/side` in typed text does not activate side chat.
- [ ] Raw `/side` in pasted text does not activate side chat.
- [ ] Slash menu `/side` still creates side mode through a visible chip.
- [ ] `Side chat for selection` never sends prompt text to the source terminal.
- [ ] `Add as context` sends selected context to the source terminal only after user submit.
- [ ] Selection content is not stored in backend side-chat registry records.
- [ ] Toolbar clicks do not clear selection before snapshotting.
- [ ] Canvas terminal toolbar stays clipped to the terminal card.
- [ ] All new copy is localized in English and Chinese.

## Exploratory agent-browser checks

Use these after implementation. The test-run agent must load Agent Browser instructions before running them: prefer the installed `agent-browser` skill; otherwise run `agent-browser skills get core --full`. If Agent Browser is unavailable, use `specs/references/agent-browser-setup.md` and record the gap in Coverage Status.

1. In a normal terminal pane, select one line, click `Add as context`, and confirm the chip, focus, and toolbar dismissal feel clear.
2. Select a multi-line error block, click `Side chat for selection`, submit, and confirm the side modal reads as a separate side chat.
3. Paste text containing `/side` and confirm the UI shows no side chip or agent selector.
4. Repeat in a Canvas terminal card and verify the toolbar and side chat affordances stay inside the card.
5. Repeat in a narrow viewport and verify toolbar buttons do not overlap terminal content or AI Input controls.

## Acceptance criteria

- [ ] All Must Have PRD items have at least one planned or passing scenario.
- [ ] Terminal selection can create a removable `Selection` context chip.
- [ ] `Side chat for selection` creates side mode through a protocol chip and keeps the source terminal untouched.
- [ ] Raw `/side` no longer triggers side chat from typed, pasted, or resolved prompt text.
- [ ] Slash menu `/side` remains discoverable and inserts a protocol-backed chip.
- [ ] Prompt text explicitly labels selected terminal context.
- [ ] Selection text is bounded and not persisted outside the final terminal/side-chat prompt.
- [ ] `atmos-specs-test-run` updates Coverage Status with exact automated commands and exploratory results.

## Manual verification steps

1. Start `just dev-api` and `just dev-web`, open a workspace terminal, select terminal output, and verify both toolbar actions.
2. In Desktop via `just dev-desktop`, repeat selection, add-as-context, and side-chat-for-selection flows.
3. Paste a block of text containing `/side` into terminal AI Input and confirm it sends normally.

## Non-coverage

- Mobile terminal selection, because mobile UI is out of scope.
- Reload persistence for selection chips, because selection context is intentionally client-local in v1.
- Exact xterm selection rectangle fidelity across every browser engine; covered by exploratory checks and manual smoke.

## Coverage Status

> Filled after implementation by `atmos-specs-test-run`. Include exact automated tests, commands, agent-browser prompts/results when used, and remaining gaps.
