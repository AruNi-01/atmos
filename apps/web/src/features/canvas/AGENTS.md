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
