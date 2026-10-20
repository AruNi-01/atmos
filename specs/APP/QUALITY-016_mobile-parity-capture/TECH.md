# TECH · QUALITY-016: Mobile Parity Capture Hooks

> Technical Design · HOW. Capture and evidence hooks sliced from closed PR #317 (`2b1f66b82`) onto current `main`, stacked on the APP-081 tail-jump branch. This is harness work, not a new chat feature.

## Scope summary

The iOS parity harness needs stable identifiers, a preview that can hold Reply 50, and scripts that wait for log lines. #317 mixed that harness with a second chat UI and a Skia patch. This spec keeps the harness.

In scope:

1. Preview capture owner: reduced-motion pin, replay/lane/composer steps, tail-return logs, `revealMessage` / `onViewport` from APP-081.
2. Test identifiers on the existing glass scroll pill, card pills, composer field, and the reject permission chip.
3. `ios-capture.sh`, `run-until-line.py`, and the PillTap UI test, plus the two workflow self-checks that those scripts need.
4. Quiet disk-frame reads and in-app PNG sampling via the Skia already depended on by the app.

Out of scope (do not port from #317):

- `patches/@shopify%2Freact-native-skia@2.6.2.patch`.
- `scripts/agent-chat-parity/fence-icons.mjs` and the `NOTICE` activity-glyph attribution.
- Category A unwired chrome (activity glyph/mark, turn-files, user-message press/fade/link/meta, usage tooltip, scroll-pill-unit).
- Category B UI that replaces #323 glass (tool body, diff/ANSI, http chip, web search, markdown chrome, permission/plan/command multi-step, lane card `bare`, composer paste, thinking, ink/color, inline subagent, grok panel, moving web `grok-chrome` / `chat-helpers`).
- `parity-composer-cards.ts` fields `preview` and `subagentTools`. Current `ComposerCards` has no such fields, and #323 already added `status: "running"`.
- `EVIDENCE_PUSH`, hostnames, and any screenshot or recording committed to the repo.
- Raising `--max-warnings` above 455.

APP-081 still owns the product parity contract. This spec owns only the capture slice.

## Architecture

```
preview-chat-screen
  ├─ parity-cycle (single tail owner, pinned frame)
  ├─ parity-replay / parity-lane-steps / parity-composer-states
  ├─ parity-reduced-motion  →  useReducedMotion
  ├─ capture-parity-view    →  Documents/parity-motion/*.png (device only)
  └─ existing glass UI
        scroll pill testID
        card pill testIDs + measureInWindow
        composer autoFocus + testID
        permission reject chip testID
ios-capture.sh  →  simctl + PillTap + run-until-line.py
ci-mobile-ios-parity.yml
  structural: run-until-line.py --self-test (every matching PR)
  ios-simulator: still requires the ios-parity label
```

The tail jump itself stays in APP-081 (`transcript-jump.ts`, `revealMessage`). This preview only calls that handle.

## Decisions

### D1. Patch hooks onto #323 glass, do not replace it

`scroll-pill.tsx` keeps `COMPOSER_GLASS_WELL`. The only addition is `SCROLL_PILL_TEST_ID = "agent-chat-scroll-pill"`.

`composer-pill-row.tsx` keeps the APP-081 slot (`scheduleOnRN`, measured row height, edge fades). Capture adds optional `onScrollPillX` / `onCardScroll`, `measureInWindow`, `testID="agent-chat-card-pill-scroller"`, and `testID={\`agent-chat-card-pill-${pill.id}\`}`.

`AgentChatComposer` gains optional `autoFocus`. When the prop is omitted, the effect does not focus or blur. The field gets `testID="agent-chat-composer-input"`.

### D2. Permission skip is the existing reject chip

#317's permission card is a separate multi-question UI. It is not ported. `isRejectPermissionOption` already matches reject/deny/skip/cancel/decline. That option renders the current `GlassTextButton` with `testID="agent-chat-permission-skip"`. `GlassAction.testID` is optional and is set on the accessible chip `View`. Other options have no test id.

### D3. Preview drops the two imports that need the discarded UI

`laneCardDrawsOwnFrame` and `bare=` need the second card frame. `userMessageOutsidePressCapture` needs `user-message-outside.ts`. Neither module is in this slice. `ExpandedCard` stays the #323 glass card. `LaneCardBody` is not given a `messages` prop it does not accept.

`const pillRowHeight = pillHeight` stays, so the APP-081 slot test still passes.

### D4. Reduced motion is a preview pin, not a product setting

`pushParityReducedMotion` increments a counter. `useReducedMotion` returns `chatReducedMotion(system, forced)` where `forced` wins only while the counter is positive. Product screens never push, so they still follow the system setting.

### D5. Evidence stays off the git remote

`ios-capture.sh` from #317 does not set `EVIDENCE_PUSH` and does not write a hostname. This spec does not add either. PNG/MOV output stays on the simulator or in the label-gated Actions artifact `ios-parity`. Do not commit those files.

`readParityDiskFrame({ quiet: true })` suppresses the missing-file log when the preview is probing rather than failing.

### D6. Workflow stays label-gated

Two additions on top of QUALITY-010:

- `python3 scripts/agent-chat-parity/run-until-line.py --self-test` in the `structural` job.
- `defaults write com.apple.iphonesimulator ConnectHardwareKeyboard -bool false` before `simctl boot`, so a composer tap can show the software keyboard.

`ios-simulator` still runs only on `workflow_dispatch` or a PR labeled `ios-parity`. A skipped job on a draft without that label is success.

### D7. F12 renders Skip, and a PillTap miss fails the job

F12's permission request includes a reject-class option next to Allow: `{ "option_id": "skip", "name": "Skip" }`. `isRejectPermissionOption` matches that id and name, so the existing glass chip renders `testID="agent-chat-permission-skip"`. Allow stays without a test id. The expected structural tree records the Skip option label. No second permission UI is added.

`ios-capture.sh` used to continue after a PillTap miss (`A miss does not fail the job`, and callers that only echoed the failure). A miss now prints `PillTap missed:` and exits non-zero. That covers the scroll pill, the F12 card-pill pass (plan, queue, permission pill, Skip chip), the card-row swipe, and the composer field. Comments name the Skip chip on the permission card. They do not say Skip lives on a Questions card, and they do not say the F12 question has no options. Replay, pinned lane, and composer-state screenshots still do not fail the job.

## Risks

- PillTap looks up `buttons["agent-chat-permission-skip"]`. F12 now has the Skip option that renders that id. Whether XCUITest classifies the chip `View` as a button is still unverified here: there is no iOS Simulator in this environment, and the job stays opt-in. The Bun tests lock the fixture option, the source string, and that a miss is no longer swallowed.
- `capture-parity-view.ts` calls `makeImageFromView` / `readPixels` on the installed Skia. The flat-fill patch is not applied. A uniform-frame shot can still log `[parity] motion flat`. That is a log, not a patch.
- Slot width is pill width + 8, and the glass row already has `gap: 8`. APP-081 records that double gap. This spec does not change it.
- `writeParityMotionPng` writes under the app Documents directory at capture time. It is not a repo path.

## Verification

See TEST.md. Commands that must pass before the draft is updated: the new Bun files, `python3 scripts/agent-chat-parity/run-until-line.py --self-test`, `bash -n scripts/agent-chat-parity/ios-capture.sh`, `bun lint` at `--max-warnings=455`, and `oxfmt --check` on the changed paths.
