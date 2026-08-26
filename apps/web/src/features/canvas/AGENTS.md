# Canvas Feature Notes

Canvas widgets render inside tldraw `HTMLContainer`s. Those DOM trees can be
scaled by the canvas camera, so viewport coordinates and widget-local layout
coordinates are not interchangeable.

## Popovers And Context Menus

- Ordinary Radix `Popover` / `DropdownMenu` triggers on real buttons are usually
  fine because Radix reads the trigger's viewport rect.
- Manually positioned menus are risky. If a hidden trigger or menu anchor lives
  inside a scaled canvas widget, do not use `event.clientX/clientY` directly for
  `left/top`.
- Convert viewport points to widget-local points with
  `clientPointToLocalElementPoint(...)`, then position the hidden trigger with
  `position: absolute` inside that widget.
- Direct `clientX/clientY` is only appropriate for viewport-fixed overlays that
  are rendered outside the scaled canvas DOM.
- Shared components reused inside canvas should expose an explicit local-anchor
  mode instead of hard-coding canvas assumptions.

## Text Selection

Native text selection/caret hit-testing inside scaled widget DOM can drift for
the same coordinate-system reason, but it is not fixed by popover anchor math
alone. For precise text interaction in scaled canvas content, prefer rendering
the interactive surface in an unscaled fixed overlay measured from the widget
viewport rect, similar to the live canvas terminal overlay.

## Canvas ↔ Center Stage (bidirectional)

Today **only a canvas terminal** is a live two-way bind: pin a center-stage
tmux pane onto the board, Source jumps back to that pane. Other widgets
(Files, Changes, Center, PRs, Agent status, Browser, …) are **created on
canvas**. They bind a workspace/project **host** (repo/cwd), not a live mosaic
leaf. Center widget is an embedded mini-center (starts at Overview); opening
files/PRs stays inside the widget. Widget Source is “go to this host”, not
“restore the pane I was pinned from”.

If a later feature pins a live Center surface (tab, mosaic leaf, extra space)
and jumps back, keep the same identity split Terminal already uses. Mixing
these ids is what made footer Agent status and canvas Source land on the
wrong space/tab after multi-space + mosaic.

| Use | Identity |
| --- | --- |
| URL `?id=` / tmux session / agent pane key / `killTmuxWindow` | Host workspace or project id (`hostIdFromCenterKey`) |
| Terminal tab store, mosaic layout, github/browser tab catalogs | Paint context (`makeCenterSpaceKey(host, spaceId)`) |
| Extra-space tmux window | Namespaced name (`cs__{spaceId}__…`); space from the name if the pin stored only host |
| Exclusive session tab (terminal, browser) | Reveal the mosaic leaf that already owns it (`planCenterTabAttach` default `reveal`) |
| Shareable tab (files, changes, overview) | May copy onto the focused leaf (`placement: "focused"`) |

Navigation: commit dest `?tab=` / `terminalTmux` / `sideChat` **before** a
same-host space switch (`preserveDeepLink: true`). Switching first lets
leftover chrome bounce the incoming space. Prefer
`navigateToLocatedPane` / `navigateToCanvasTerminalSource` /
`commitLocatedPaneNavigation` (`pushWorkspaceDeepLink`) over a raw
`router.push` of a paint key.

Persist the pin as host **and** space (or a namespaced tmux/window id you can
parse). `CanvasContextRef` is host-only today — that is enough for
repo-scoped widgets, not for restoring a specific extra space. Canvas overlay
`useContextParams().effectiveContextId` is the URL host; live space is
`useCenterPaintContextId()`.
