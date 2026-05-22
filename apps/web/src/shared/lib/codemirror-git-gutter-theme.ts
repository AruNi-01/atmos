import { EditorView } from '@codemirror/view';

export const gitGutterTheme = EditorView.baseTheme({
  '.cm-git-change-gutter': {
    width: '7px',
    minWidth: '7px',
  },
  '.cm-git-change-gutter .cm-gutterElement': {
    display: 'flex',
    alignItems: 'stretch',
    justifyContent: 'center',
    paddingLeft: '0',
    paddingRight: '0',
  },
  /* elementClass merges onto .cm-gutterElement (not a child wrapper). */
  '.cm-git-chunk-bar-wrap': {
    display: 'flex',
    alignItems: 'stretch',
    justifyContent: 'center',
    width: '100%',
    minWidth: '100%',
  },
  '.cm-git-gutter-bar-hit': {
    flex: '1 1 auto',
    alignSelf: 'stretch',
    width: '100%',
    minHeight: '100%',
    display: 'flex',
    alignItems: 'stretch',
    justifyContent: 'center',
    cursor: 'pointer',
    userSelect: 'none',
  },
  '.cm-git-gutter-bar': {
    flex: '0 0 5px',
    width: '5px',
    minWidth: '5px',
    maxWidth: '5px',
    minHeight: '100%',
    alignSelf: 'stretch',
    borderRadius: '0',
    cursor: 'pointer',
    transition: 'opacity 0.12s ease, filter 0.12s ease',
    opacity: 0.92,
  },
  '.cm-git-gutter-bar-expanded': {
    opacity: 1,
    filter: 'brightness(1.08)',
  },
  '.cm-git-gutter-added': {
    background: '#22c55e',
  },
  '.cm-git-gutter-deleted': {
    background: '#ef4444',
  },
  '.cm-git-gutter-modified': {
    background: '#eab308',
  },
  '.cm-git-change-gutter .cm-gutterElement.cm-git-deleted-seam-gutter': {
    position: 'relative',
    overflow: 'visible',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: '0',
    paddingRight: '0',
  },
  '.cm-git-deleted-seam-inner': {
    position: 'absolute',
    left: '50%',
    top: '0',
    transform: 'translate(-50%, -50%)',
    zIndex: '3',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    userSelect: 'none',
  },
  '.cm-git-deleted-seam-inner:focus-visible': {
    outline: '2px solid hsl(var(--ring) / 0.7)',
    outlineOffset: '1px',
    borderRadius: '2px',
  },
  '.cm-git-deleted-collapsed-triangle': {
    display: 'block',
    width: '0',
    height: '0',
    borderStyle: 'solid',
    borderWidth: '5px 0 5px 7px',
    borderColor: 'transparent transparent transparent #ef4444',
  },
  '.cm-git-line-bg-added': {
    background: 'rgba(34, 197, 94, 0.14)',
  },
  // Force the gutter element row tint over the active-line gutter highlight (which would otherwise paint solid bg).
  '.cm-gutterElement.cm-git-line-bg-added': {
    background: 'rgba(34, 197, 94, 0.14) !important',
  },
  '.cm-git-line-bg-expanded': {
    filter: 'brightness(1.04)',
  },
  // Keep git line tint when the active-line theme would otherwise replace it; layer a faint highlight on top instead.
  '.cm-line.cm-activeLine.cm-git-line-bg-added': {
    backgroundColor: 'rgba(34, 197, 94, 0.14) !important',
    backgroundImage:
      'linear-gradient(rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.07)) !important',
  },
  '.cm-gutterElement.cm-activeLineGutter.cm-git-line-bg-added': {
    backgroundColor: 'rgba(34, 197, 94, 0.14) !important',
    backgroundImage:
      'linear-gradient(rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.07)) !important',
  },
  '.cm-gutters .cm-gutter': {
    borderInlineEnd: 'none',
  },
  // Word-level diff highlights — layered ON TOP of the line bg, so alpha is roughly 2× the line tint to remain
  // visibly distinct without overwhelming the surrounding text. `presentableDiff` (called by `Chunk.build`)
  // already snaps to word boundaries when feasible, so no extra tokenization is needed.
  // - `cm-git-word-changed-new`: changed substring on the NEW (live editor) side of a modified chunk.
  // - `cm-git-word-changed-old`: changed substring on the OLD (panel body) side of a modified chunk.
  '.cm-git-word-changed-new': {
    backgroundColor: 'rgba(34, 197, 94, 0.32)',
    borderRadius: '2px',
  },
  '.cm-git-word-changed-old': {
    backgroundColor: 'rgba(239, 68, 68, 0.32)',
    borderRadius: '2px',
  },
  // Per-cell red tint for `DiffPanelWidget` gutter cells. `gutterWidgetClass` attaches `cm-git-panel-cell` + a
  // kind-specific class to the gutter element of EVERY gutter that is part of the panel widget's vertical extent.
  '.cm-gutterElement.cm-git-panel-cell-deleted, .cm-gutterElement.cm-git-panel-cell-modified': {
    backgroundColor: 'rgba(239, 68, 68, 0.14) !important',
  },
  // Panel wrap (lives inside cm-content). Wrap-only red bg covers the content area; the gutter-side red bg comes
  // from the `gutterWidgetClass` facet that paints panel-cell-* class on every gutter cell aligned with this
  // widget. No measurement / negative margin / stacking trickery needed — keeps the gutter strip opaque so
  // horizontally-scrolled code can't show through the line numbers.
  '.cm-git-diff-panel': {
    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
    fontSize: '12px',
    boxSizing: 'border-box',
    position: 'relative',
    marginTop: '0',
    marginBottom: '0',
    paddingTop: '0',
    paddingBottom: '0',
    border: 'none',
    lineHeight: '0',
    minHeight: '0',
    display: 'block',
  },
  '.cm-line:has(.cm-git-diff-panel)': {
    paddingTop: '0',
    paddingBottom: '0',
    marginTop: '0',
    marginBottom: '0',
    minHeight: '0',
    lineHeight: '0',
  },
  // Floatbar overlay: a SINGLETON element appended to `.cm-editor` (view.dom), NOT inside the panel widget. JS
  // (`gitHunkFloatbarOverlay`) sets `top` to track the active panel's screen-Y and toggles `display`. Right
  // edge is fixed in viewport space because view.dom doesn't scroll — the floatbar stays anchored to the
  // visible right edge regardless of horizontal code scroll. zIndex must beat the minimap overlay (zIndex 2).
  // Detached pill, anchored to the panel's TOP edge: square top corners (no top border) so it visually "hangs"
  // from the panel boundary like a tab; rounded bottom corners + 1px border on the three free sides (left,
  // right, bottom) to make the bar feel separate from the chunk surface below it.
  '.cm-git-panel-floatbar': {
    position: 'absolute',
    right: '12px',
    zIndex: '20',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    pointerEvents: 'auto',
    borderRadius: '0 0 6px 6px',
    borderTop: 'none',
    borderRight: '1px solid rgba(255, 255, 255, 0.12)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
    borderLeft: '1px solid rgba(255, 255, 255, 0.12)',
    padding: '3px 4px',
    gap: '2px',
    background: 'rgba(10, 10, 12, 0.92)',
    color: '#f4f4f5',
    boxShadow: '0 4px 18px rgba(0, 0, 0, 0.35)',
  },
  // The minimap (`@replit/codemirror-minimap`) renders as an absolutely-positioned overlay on the right side of
  // `.cm-content` — NOT outside it — so a `right: 12px` floatbar would sit ON TOP of the minimap. When the minimap
  // is enabled (its gutter exists in the DOM), shift the floatbar left by the minimap's width so the buttons
  // land just to the left of it (with the same 12px inset preserved). The 50px constant matches the
  // `.cm-minimap-gutter` width hardcoded in `BaseCodeMirrorEditor.tsx`'s theme; if that ever changes, update both.
  '&:has(.cm-minimap-gutter) .cm-git-panel-floatbar': {
    right: '62px',
  },
  '.cm-git-panel-actions': {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: '3px',
  },
  '.cm-git-panel-actions button': {
    fontSize: '11px',
    fontWeight: '500',
    padding: '2px 8px',
    borderRadius: '5px',
    border: 'none',
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    lineHeight: 1.2,
  },
  '.cm-git-panel-actions button:hover:not(:disabled)': {
    background: 'rgba(255, 255, 255, 0.1)',
  },
  '.cm-git-panel-actions button:disabled': {
    opacity: 0.45,
    cursor: 'not-allowed',
  },
  '.cm-git-panel-float-close': {
    padding: '0 6px',
    fontSize: '16px',
    lineHeight: 1,
    minWidth: '24px',
  },
  // Body sits inside `wrap`. Wrap's red bg covers the content area; the body itself stays transparent so it
  // doesn't double-tint. Body text aligns naturally with editor lines because we don't bleed wrap left over the
  // gutters anymore (`.cm-line` already provides the correct left edge inside cm-content).
  '.cm-git-panel-body': {
    paddingTop: '0',
    paddingBottom: '0',
    paddingLeft: '0',
    paddingRight: '0',
    userSelect: 'text',
    cursor: 'text',
    WebkitUserSelect: 'text',
    boxSizing: 'border-box',
  },
  // Single `<pre>` for the whole deleted snippet. `white-space: pre` preserves the exact source whitespace + line
  // breaks; line-height matches `.cm-scroller` (1.6) so each line aligns vertically with regular editor rows.
  // Match `.cm-line`'s `padding-left: 6px` so deleted text starts at the same x-coordinate as live editor text.
  '.cm-git-panel-pre': {
    fontFamily: 'inherit',
    fontSize: 'inherit',
    color: 'inherit',
    whiteSpace: 'pre',
    margin: '0',
    paddingTop: '0',
    paddingBottom: '0',
    paddingLeft: '6px',
    paddingRight: '6px',
    background: 'transparent',
    lineHeight: '1.6',
  },
});
