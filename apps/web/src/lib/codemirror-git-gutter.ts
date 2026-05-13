import { highlightingFor, language } from '@codemirror/language';
import { Chunk } from '@codemirror/merge';
import {
  Facet,
  RangeSet,
  StateEffect,
  StateField,
  Text,
  type EditorState,
  type Extension,
  type Range,
  type Transaction,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  GutterMarker,
  ViewPlugin,
  WidgetType,
  gutter,
  gutterLineClass,
  gutterWidgetClass,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { highlightTree } from '@lezer/highlight';
import { toastManager } from '@workspace/ui';
import { buildUnifiedPatchForChunk, sliceLines } from '@/lib/git-chunk-patch';

const DIFF_CFG = { scanLimit: 3000, timeout: 400 } as const;

export interface GitGutterHost {
  fileRelativePath: string;
  fileStatus: string;
  readonly originalContent: string;
  stagePatch: (patch: string) => Promise<{ ok: boolean; error?: string }>;
  restorePatch: (patch: string) => Promise<{ ok: boolean; error?: string }>;
  onGitStateChanged?: (kind: 'stage' | 'restore') => void;
}

const gitGutterHostFacet = Facet.define<GitGutterHost, GitGutterHost | null>({
  combine: (xs) => xs.find((v) => v != null) ?? null,
});

/**
 * Selection effects. Multiple chunks can stay expanded simultaneously — the user explicitly asked for this so
 * they can review several hunks side by side without having one auto-collapse the other.
 *
 * - `toggleGitSelection`: flips one chunk (used by clicking the gutter bar).
 * - `openGitSelection`: opens one chunk if not already open (used by prev/next nav so re-clicking next never
 *   accidentally closes the chunk you just opened).
 * - `closeGitSelection`: closes one chunk (used by the panel's × button).
 * - `clearGitSelections`: closes everything (used internally on doc reload).
 */
const toggleGitSelection = StateEffect.define<number>();
const openGitSelection = StateEffect.define<number>();
const closeGitSelection = StateEffect.define<number>();
const clearGitSelections = StateEffect.define<void>();

interface GitGutterState {
  original: Text;
  chunks: readonly Chunk[];
  selectedIndices: ReadonlySet<number>;
}

const EMPTY_SELECTION: ReadonlySet<number> = new Set();

/**
 * Inclusive 1-based line range in the **current document** covered by this chunk.
 * Draws one vertical bar per line in this range in the change gutter.
 */
function chunkDocLineRange(chunk: Chunk, doc: Text): { from: number; to: number } | null {
  if (doc.lines === 0) return null;
  if (chunk.fromB < chunk.toB) {
    const fromPos = Math.min(chunk.fromB, doc.length);
    const endPos = Math.max(chunk.toB - 1, chunk.fromB);
    const from = doc.lineAt(fromPos).number;
    const to = doc.lineAt(Math.min(endPos, doc.length)).number;
    return { from, to };
  }
  // Pure deletion in B: anchor at the insertion point (one logical line).
  const pos =
    chunk.fromB <= 0 ? 1 : Math.min(Math.max(chunk.fromB, 1), Math.max(doc.length, 1));
  const ln = doc.lineAt(pos).number;
  return { from: ln, to: ln };
}

function classifyChunkKind(chunk: Chunk): 'added' | 'deleted' | 'modified' {
  const oldEmpty = chunk.fromA === chunk.toA;
  const newEmpty = chunk.fromB === chunk.toB;
  if (oldEmpty && !newEmpty) return 'added';
  if (!oldEmpty && newEmpty) return 'deleted';
  return 'modified';
}

/** Start position of the first line in doc B for this chunk — expanded panel sits above it. */
function chunkFirstLineFrom(chunk: Chunk, doc: Text): number {
  if (doc.length === 0) return 0;
  const pos =
    chunk.fromB < chunk.toB
      ? Math.min(chunk.fromB, doc.length)
      : Math.min(Math.max(chunk.fromB, 1), doc.length);
  return doc.lineAt(pos).from;
}

/** gutterLineClass marker — reuses the same classes as {@link Decoration.line} for that document row. */
class GitDiffGutterBgMarker extends GutterMarker {
  constructor(readonly classNames: string) {
    super();
    this.elementClass = classNames;
  }

  override eq(other: GutterMarker): boolean {
    return other instanceof GitDiffGutterBgMarker && other.classNames === this.classNames;
  }
}

/** Full-height vertical bar in the gutter (one per changed line). */
class GitChunkBarMarker extends GutterMarker {
  constructor(
    readonly chunkIndex: number,
    readonly kind: 'added' | 'deleted' | 'modified',
    readonly expanded: boolean,
  ) {
    super();
    this.elementClass = 'cm-git-chunk-bar-wrap';
  }

  override eq(other: GutterMarker): boolean {
    return (
      other instanceof GitChunkBarMarker &&
      other.chunkIndex === this.chunkIndex &&
      other.kind === this.kind &&
      other.expanded === this.expanded
    );
  }

  override toDOM(view: EditorView): Node {
    const hit = document.createElement('div');
    hit.className = `cm-git-gutter-bar-hit${this.expanded ? ' cm-git-active-hunk-target' : ''}`;

    const bar = document.createElement('div');
    bar.className = `cm-git-gutter-bar cm-git-gutter-${this.kind}${this.expanded ? ' cm-git-gutter-bar-expanded' : ''}`;

    hit.setAttribute('role', 'button');
    hit.tabIndex = 0;
    hit.setAttribute('aria-label', 'Toggle inline diff for this change');
    hit.appendChild(bar);

    const toggle = () => {
      view.dispatch({ effects: toggleGitSelection.of(this.chunkIndex) });
    };

    hit.addEventListener('mousedown', (e) => {
      e.preventDefault();
      toggle();
    });
    hit.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
    return hit;
  }
}

/**
 * Render `text` (joined-with-\n source of the deleted chunk) as one panel row per source line, applying full
 * syntax highlighting via the editor's current language parser + highlight style. Modeled directly on the approach
 * used by `@codemirror/merge`'s `unifiedMergeView` for its `cm-deletedChunk` widget — same library, same idea:
 * widget DOM rendered with the language's tokens, so deleted code reads exactly like an editor line, supports
 * native text selection / copy, but never enters `state.doc` (which would break save / undo / diff).
 *
 * We render every deleted line — no truncation — to mirror Zed-style display where the full removed snippet is
 * always visible (the file save / undo / diff still don't see any of this since it's pure widget DOM).
 */
const SYNTAX_HIGHLIGHT_MAX = 3000;

/**
 * Render `oldLines` into a single `<pre>` block where the source text is preserved EXACTLY (`white-space: pre`,
 * \n separators) and syntax highlighting is overlaid via inline `<span>` tokens emitted by `highlightTree`. Using
 * one `<pre>` instead of one `<div>` per line guarantees we don't introduce phantom rows: the output's vertical
 * extent equals exactly `(oldLines.length) * line-height`, just like a regular editor area would render the same
 * snippet. (The previous one-div-per-line approach made it look like every row had a blank line below it on
 * certain themes — `<div>`s with `whiteSpace:pre` and short content interact oddly with surrounding line-height
 * inheritance; a single `<pre>` sidesteps the whole class of problem.)
 */
/**
 * Render `oldLines` into the panel `<pre>`, threading TWO orthogonal mark layers in a single pass:
 *   1. Syntax highlighting from the editor's language parser (`highlightTree` → token classes)
 *   2. Word-level diff highlighting from `chunk.changes` (`changeRangesA` → `cm-git-word-changed-old` overlay)
 *
 * Both layers apply to the same character ranges, so we can't render them in two passes (the second wouldn't be
 * able to "wrap" the first's `<span>` children without DOM gymnastics). Instead, every `append(from, to, syntax)`
 * walk gets re-split by the diff ranges: any sub-slice that intersects a change gets BOTH classes joined into
 * one span, the rest stays syntax-only. `changeRangesA` is assumed sorted ascending and non-overlapping (which
 * `presentableDiff` guarantees inside `Chunk.build`).
 */
function appendHighlightedOldRows(
  view: EditorView,
  body: HTMLElement,
  oldLines: string[],
  changeRangesA: ReadonlyArray<{ from: number; to: number }>,
) {
  const text = oldLines.join('\n');
  const pre = document.createElement('pre');
  pre.className = 'cm-git-panel-pre';
  body.appendChild(pre);

  const appendSpan = (from: number, to: number, cls: string) => {
    if (from >= to) return;
    const slice = text.slice(from, to);
    if (cls) {
      const span = document.createElement('span');
      span.className = cls;
      span.textContent = slice;
      pre.appendChild(span);
    } else {
      pre.appendChild(document.createTextNode(slice));
    }
  };

  // Splits a (syntax-classed) slice by the diff change ranges, emitting separate spans where the slice overlaps
  // a change. We only walk forward through `changeRangesA` per call; `lastChange` is a cursor we advance across
  // calls to keep the scan O(N + C) instead of O(N · C).
  let lastChange = 0;
  const append = (from: number, to: number, syntaxCls: string) => {
    if (from >= to) return;
    if (changeRangesA.length === 0) {
      appendSpan(from, to, syntaxCls);
      return;
    }
    let pos = from;
    let i = lastChange;
    // Skip any change ranges that ended before this slice — also pull `lastChange` forward so subsequent calls
    // don't re-scan them.
    while (i < changeRangesA.length && changeRangesA[i]!.to <= pos) i++;
    lastChange = i;

    while (i < changeRangesA.length && pos < to) {
      const cr = changeRangesA[i]!;
      if (cr.from >= to) break;
      const chgFrom = Math.max(pos, cr.from);
      const chgTo = Math.min(to, cr.to);
      if (chgFrom > pos) appendSpan(pos, chgFrom, syntaxCls);
      const merged = syntaxCls
        ? `${syntaxCls} cm-git-word-changed-old`
        : 'cm-git-word-changed-old';
      appendSpan(chgFrom, chgTo, merged);
      pos = chgTo;
      // Only advance `i` when the change range is fully consumed by this slice; otherwise the next slice will
      // handle the remaining tail.
      if (cr.to <= to) i++;
      else break;
    }
    if (pos < to) appendSpan(pos, to, syntaxCls);
  };

  const lang = view.state.facet(language);
  if (lang && text.length <= SYNTAX_HIGHLIGHT_MAX) {
    const tree = lang.parser.parse(text);
    let pos = 0;
    highlightTree(
      tree,
      { style: (tags) => highlightingFor(view.state, tags) },
      (from, to, cls) => {
        if (from > pos) append(pos, from, '');
        append(from, to, cls ?? '');
        pos = to;
      },
    );
    if (pos < text.length) append(pos, text.length, '');
  } else {
    append(0, text.length, '');
  }
}

function fillDiffPanelBody(
  view: EditorView,
  body: HTMLElement,
  kind: 'added' | 'deleted' | 'modified',
  oldLines: string[],
  chunk: Chunk,
) {
  if (kind === 'added') return;
  // Word-level diff highlight only applies to MODIFIED chunks: for a pure deletion the whole panel is red, so an
  // intra-line "what changed" overlay would be meaningless (everything changed). `chunk.changes` ranges are
  // relative to the chunk start, which equals the start of `oldLines.join('\n')` — no offset needed. Skip pure
  // insertions on the old side (`toA === fromA`): they have no old-side text to highlight.
  const changeRangesA: Array<{ from: number; to: number }> =
    kind === 'modified'
      ? chunk.changes
          .filter((c) => c.toA > c.fromA)
          .map((c) => ({ from: c.fromA, to: c.toA }))
      : [];
  appendHighlightedOldRows(view, body, oldLines, changeRangesA);
}

/**
 * Pure deletion: red triangle on the seam (top of anchor line gutter), no document block widget — line spacing unchanged.
 */
class GitDeletedSeamGutterMarker extends GutterMarker {
  constructor(readonly chunkIndex: number) {
    super();
    this.elementClass = 'cm-git-deleted-seam-gutter';
  }

  override eq(other: GutterMarker): boolean {
    return other instanceof GitDeletedSeamGutterMarker && other.chunkIndex === this.chunkIndex;
  }

  override toDOM(view: EditorView): HTMLElement {
    const hit = document.createElement('div');
    hit.className = 'cm-git-deleted-seam-inner';
    hit.setAttribute('role', 'button');
    hit.tabIndex = 0;
    hit.setAttribute('aria-label', 'Show deleted lines');

    const tri = document.createElement('span');
    tri.className = 'cm-git-deleted-collapsed-triangle';
    tri.setAttribute('aria-hidden', 'true');
    hit.appendChild(tri);

    const toggle = () => {
      view.dispatch({ effects: toggleGitSelection.of(this.chunkIndex) });
    };

    hit.addEventListener('mousedown', (e) => {
      e.preventDefault();
      toggle();
    });
    hit.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });

    return hit;
  }
}

class DiffPanelWidget extends WidgetType {
  constructor(readonly chunkIndex: number) {
    super();
  }

  override eq(other: DiffPanelWidget): boolean {
    return other.chunkIndex === this.chunkIndex;
  }

  override toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'cm-git-diff-panel';
    // Tag the panel widget with its chunk index so `gitHunkFloatbarOverlay` can (a) identify which panel the
    // pointer is over for direct panel hovers, and (b) look up the panel's screen rect to position the overlay
    // floatbar (the floatbar lives outside cm-content — see overlay plugin for why).
    wrap.dataset.chunkIndex = String(this.chunkIndex);

    const host = view.state.facet(gitGutterHostFacet);
    const gs = view.state.field(gitGutterStateField);
    const chunk = gs.chunks[this.chunkIndex];
    if (!host || !chunk) return wrap;

    const original = gs.original;
    const oldLines = sliceLines(original, chunk.fromA, chunk.toA);

    const body = document.createElement('div');
    body.className = 'cm-git-panel-body';

    const chunkKind = classifyChunkKind(chunk);
    fillDiffPanelBody(view, body, chunkKind, oldLines, chunk);

    body.setAttribute('contenteditable', 'false');
    body.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    if (body.childNodes.length > 0) {
      wrap.appendChild(body);
    }

    // Paint the chunk tint on `wrap` so the panel body (inside cm-content) gets a red bg. The matching tint on the
    // gutter side comes from `panelCellBgGutterClass` — a `gutterWidgetClass` facet contribution that adds a class
    // to every gutter cell aligned with this `DiffPanelWidget` (line numbers + fold + change-gutter all get red).
    // We deliberately do NOT bleed the wrap left over the gutters (no negative `marginLeft`): doing so would
    // require making `.cm-gutters` transparent globally, which then lets horizontally-scrolled code show through
    // the line-number column. Splitting the bg into "wrap (content side) + gutter cell class (gutter side)" keeps
    // the gutters opaque + gives a continuous red strip across the whole row.
    if (chunkKind !== 'added') {
      wrap.style.background = 'rgba(239, 68, 68, 0.14)';
    }

    return wrap;
  }
}

/**
 * Build the action button row (Stage / Restore / Next / Prev / Close) for one chunk. Used by
 * `gitHunkFloatbarOverlay` to render content into the singleton overlay element. Pulled out of the panel widget
 * so the overlay (which lives outside cm-content, OUTSIDE the panel widget DOM) can render the same buttons
 * with the same handlers.
 *
 * Important: this captures `chunkIndex` and `chunk`/`original`/`doc` snapshots from the CURRENT state. The
 * overlay calls this fresh every time it switches active chunk (in `setActive`) — never reuse a stale instance
 * across chunk changes, or button handlers will dispatch effects against the wrong chunk index.
 */
function buildFloatbarActions(view: EditorView, chunkIndex: number): HTMLElement {
  const actions = document.createElement('div');
  actions.className = 'cm-git-panel-actions';

  const host = view.state.facet(gitGutterHostFacet);
  const gs = view.state.field(gitGutterStateField);
  const chunk = gs.chunks[chunkIndex];
  if (!host || !chunk) return actions;

  const original = gs.original;
  const doc = view.state.doc;

  const mkBtn = (label: string, title: string, onClick: () => void, disabled = false) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.title = title;
    b.disabled = disabled;
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return b;
  };

  const close = mkBtn('×', 'Close panel', () =>
    view.dispatch({ effects: closeGitSelection.of(chunkIndex) }),
  );
  close.className = 'cm-git-panel-float-close';

  /**
   * Jump to a sibling chunk: open it (if not already), then smooth-scroll the editor so the chunk's first doc
   * line lands at the vertical center of the viewport. The current chunk stays open — the user explicitly
   * asked for chunks to persist when navigating.
   *
   * Why `lineBlockAt` instead of `coordsAtPos`:
   *   - `coordsAtPos(pos)` returns `null` for any position OUTSIDE the rendered viewport. CodeMirror only
   *     materializes DOM for visible lines (plus a small buffer), so a target chunk far above/below the
   *     current scroll position has no rect to measure → we'd silently bail. This was the root cause of
   *     prev/next "sometimes does nothing": clicking failed for off-viewport targets, but worked once the
   *     user scrolled past the target (which forced CM to render and remember those lines).
   *   - `lineBlockAt(pos)` returns a `BlockInfo` for ANY doc position, falling back to ESTIMATED line heights
   *     for unrendered regions. Estimates may be slightly off, but they're close enough — once the smooth
   *     scroll arrives, CM re-renders with real heights and any tiny offset is invisible at 60fps.
   *
   * Why `requestAnimationFrame`: a newly-opened chunk's panel widget has no `estimatedHeight`, so it mounts
   * with height 0 → height N. Measuring before the widget mounts would center on the line's PRE-mount Y,
   * which sits widgetHeight pixels above where the line ends up post-mount. rAF lets layout settle first.
   *
   * `BlockInfo.top` is in the same coordinate space as `scrollDOM.scrollTop` (both measured from the start of
   * the scrollable content), so the scroll-to math is direct: top + height/2 - viewport/2.
   */
  const jumpToChunk = (idx: number) => {
    const stNow = view.state.field(gitGutterStateField);
    const ch = stNow.chunks[idx];
    if (!ch) return;
    const targetLineFrom = chunkFirstLineFrom(ch, view.state.doc);
    view.dispatch({ effects: openGitSelection.of(idx) });
    requestAnimationFrame(() => {
      const block = view.lineBlockAt(targetLineFrom);
      const scroller = view.scrollDOM;
      const targetScrollTop = block.top + block.height / 2 - scroller.clientHeight / 2;
      scroller.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: 'smooth',
      });
    });
  };

  const prev = mkBtn(
    '↑',
    'Previous change',
    () => {
      if (!gs.chunks.length) return;
      const idx = (chunkIndex - 1 + gs.chunks.length) % gs.chunks.length;
      jumpToChunk(idx);
    },
    gs.chunks.length <= 1,
  );

  const next = mkBtn(
    '↓',
    'Next change',
    () => {
      if (!gs.chunks.length) return;
      const idx = (chunkIndex + 1) % gs.chunks.length;
      jumpToChunk(idx);
    },
    gs.chunks.length <= 1,
  );

  const isUntrackedNew = host.fileStatus === 'A' && original.length === 0;
  const isNewFilePatch = isUntrackedNew;

  const runPatch = async (mode: 'stage' | 'restore') => {
    const patch = buildUnifiedPatchForChunk(
      host.fileRelativePath,
      original,
      doc,
      chunk,
      isNewFilePatch,
    );
    const fn = mode === 'stage' ? host.stagePatch : host.restorePatch;
    const res = await fn(patch);
    if (!res.ok) {
      toastManager.add({
        type: 'error',
        title: mode === 'stage' ? 'Stage failed' : 'Restore failed',
        description: res.error || 'Git patch failed',
      });
      return;
    }
    host.onGitStateChanged?.(mode);
    toastManager.add({
      type: 'success',
      title: mode === 'stage' ? 'Staged chunk' : 'Restored chunk',
      description: 'Git state updated for this hunk.',
    });
    view.dispatch({ effects: closeGitSelection.of(chunkIndex) });
  };

  const stageBtn = mkBtn('Stage', 'Stage this change', () => void runPatch('stage'));

  const restoreBtn = mkBtn(
    'Restore',
    isUntrackedNew ? 'Cannot restore untracked files' : 'Discard this unstaged hunk',
    () => void runPatch('restore'),
    isUntrackedNew,
  );

  actions.append(stageBtn, restoreBtn, next, prev, close);
  return actions;
}

function textFromStringContent(s: string): Text {
  if (!s) return Text.empty;
  return Text.of(s.replace(/\r\n/g, '\n').split('\n'));
}

const gitGutterStateField = StateField.define<GitGutterState>({
  create(state) {
    const host = state.facet(gitGutterHostFacet);
    if (!host) {
      return { original: Text.empty, chunks: [], selectedIndices: EMPTY_SELECTION };
    }
    const original = textFromStringContent(host.originalContent);
    return {
      original,
      chunks: Chunk.build(original, state.doc, DIFF_CFG),
      selectedIndices: EMPTY_SELECTION,
    };
  },
  update(value, tr: Transaction) {
    let { original, chunks, selectedIndices } = value;
    let selectionChanged = false;
    let nextSelected: Set<number> | null = null;
    const ensureMutable = () => {
      if (!nextSelected) {
        nextSelected = new Set(selectedIndices);
        selectionChanged = true;
      }
      return nextSelected;
    };

    for (const e of tr.effects) {
      if (e.is(toggleGitSelection)) {
        const set = ensureMutable();
        if (set.has(e.value)) set.delete(e.value);
        else set.add(e.value);
      } else if (e.is(openGitSelection)) {
        const set = ensureMutable();
        set.add(e.value);
      } else if (e.is(closeGitSelection)) {
        const set = ensureMutable();
        set.delete(e.value);
      } else if (e.is(clearGitSelections)) {
        ensureMutable().clear();
      }
    }
    if (selectionChanged && nextSelected) selectedIndices = nextSelected;

    const host = tr.state.facet(gitGutterHostFacet);
    if (!host) {
      return { original: Text.empty, chunks: [], selectedIndices: EMPTY_SELECTION };
    }

    const nextOriginal = textFromStringContent(host.originalContent);
    if (nextOriginal.toString() !== original.toString()) {
      original = nextOriginal;
      chunks = Chunk.build(original, tr.state.doc, DIFF_CFG);
      selectedIndices = EMPTY_SELECTION;
    } else if (tr.docChanged && chunks.length) {
      chunks = Chunk.updateB(chunks, original, tr.state.doc, tr.changes, DIFF_CFG);
    }

    // Drop any out-of-range indices (chunks count may have shrunk).
    if (selectedIndices.size > 0) {
      const max = chunks.length;
      let dropped = false;
      const filtered = new Set<number>();
      for (const i of selectedIndices) {
        if (i >= 0 && i < max) filtered.add(i);
        else dropped = true;
      }
      if (dropped) selectedIndices = filtered;
    }

    return { original, chunks, selectedIndices };
  },
});

const gitGutterTheme = EditorView.baseTheme({
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
  // Per-cell red tint for `DiffPanelWidget` gutter cells. `gutterWidgetClass` (registered above as
  // `panelCellBgGutterClass`) attaches `cm-git-panel-cell` + a kind-specific class to the gutter element of EVERY
  // gutter (line numbers / fold / change-gutter) that is part of the panel widget's vertical extent. This is what
  // gives the panel its full-width red strip without us having to make `.cm-gutters` transparent globally — so
  // horizontally-scrolled code is still hidden behind opaque non-panel gutter cells.
  '.cm-gutterElement.cm-git-panel-cell-deleted, .cm-gutterElement.cm-git-panel-cell-modified': {
    backgroundColor: 'rgba(239, 68, 68, 0.14) !important',
  },
  // Panel wrap (lives inside cm-content). Wrap-only red bg covers the content side; the gutter-side red bg comes
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

/**
 * Line backgrounds when a hunk is expanded: document B is always the **new** side → green tint.
 * The gutter bar for `modified` stays yellow via {@link GitChunkBarMarker}; only the in-text highlight follows “latest = green”.
 */
function lineBgClassForChunk(expanded: boolean): string {
  const base = 'cm-git-line-bg-added';
  return expanded ? `${base} cm-git-line-bg-expanded cm-git-active-hunk-target` : base;
}

/** Lines in the document (`line.from`) that belong to ANY currently expanded git hunk. */
function forEachExpandedGitDiffLine(state: EditorState, fn: (lineFrom: number) => void): void {
  const gs = state.field(gitGutterStateField);
  if (gs.selectedIndices.size === 0) return;
  for (let i = 0; i < gs.chunks.length; i++) {
    if (!gs.selectedIndices.has(i)) continue;
    const ch = gs.chunks[i]!;
    const kind = classifyChunkKind(ch);
    if (kind !== 'added' && kind !== 'modified') continue;

    let pos = ch.fromB;
    const end = ch.toB;
    while (pos < end) {
      const line = state.doc.lineAt(pos);
      fn(line.from);
      pos = line.to + 1;
    }
  }
}

const gitDiffLineGutterHighlighter = gutterLineClass.compute([gitGutterStateField], (state) => {
  const marks: Range<GitDiffGutterBgMarker>[] = [];
  forEachExpandedGitDiffLine(state, (lineFrom) => {
    marks.push(new GitDiffGutterBgMarker(lineBgClassForChunk(true)).range(lineFrom));
  });
  return RangeSet.of(marks, true);
});

function buildGitDiffDecorations(state: EditorState): DecorationSet {
  const gs = state.field(gitGutterStateField);
  const parts: Range<Decoration>[] = [];

  forEachExpandedGitDiffLine(state, (lineFrom) => {
    parts.push(Decoration.line({ class: lineBgClassForChunk(true) }).range(lineFrom));
  });

  if (gs.selectedIndices.size > 0 && state.doc.length > 0) {
    // Sort selected indices ascending so the resulting Range[] is in document order — `Decoration.set(_, true)`
    // expects ascending starts. Multiple panel widgets render simultaneously: the user wants several chunks to
    // stay open side by side without one closing the other.
    const sorted = Array.from(gs.selectedIndices).sort((a, b) => a - b);
    for (const idx of sorted) {
      const ch = gs.chunks[idx];
      if (!ch) continue;
      const lineFrom = chunkFirstLineFrom(ch, state.doc);
      parts.push(
        Decoration.widget({
          widget: new DiffPanelWidget(idx),
          block: true,
          side: -1,
        }).range(lineFrom),
      );

      // Word-level diff highlight on the NEW side (live editor), only for modified chunks. `chunk.changes` is
      // populated by `presentableDiff` inside `Chunk.build` — already word-aligned where possible, no extra diff
      // pass needed. Each change's B-side range is relative to chunk start, so add `ch.fromB`. Skip pure
      // deletions (`toB === fromB` → no new-side text to highlight). The mark layers ON TOP of the line bg, so
      // CSS uses a brighter alpha than `.cm-git-line-bg-added`.
      if (classifyChunkKind(ch) === 'modified') {
        for (const change of ch.changes) {
          if (change.toB <= change.fromB) continue;
          const from = ch.fromB + change.fromB;
          const to = ch.fromB + change.toB;
          if (to > state.doc.length || from < 0 || from >= to) continue;
          parts.push(Decoration.mark({ class: 'cm-git-word-changed-new' }).range(from, to));
        }
      }
    }
  }

  if (!parts.length) return Decoration.none;
  return Decoration.set(parts, true);
}

const gitDiffDecorationsField = StateField.define<DecorationSet>({
  create(state) {
    return buildGitDiffDecorations(state);
  },
  update(_value, tr) {
    return buildGitDiffDecorations(tr.state);
  },
  provide: (f) => EditorView.decorations.from(f),
});

/**
 * Singleton floatbar overlay for the currently-hovered chunk.
 *
 * Why an overlay (and not a per-panel `position: absolute` button row inside the panel widget):
 *   - The panel widget lives INSIDE `cm-content`, which scrolls horizontally when line wrap is off. A floatbar
 *     positioned absolutely inside the panel scrolls left/right with the code — it doesn't stay glued to the
 *     visible viewport edge.
 *   - The minimap (`@replit/codemirror-minimap`) is an overlay that sits on top of the right side of cm-content,
 *     so any "right: 0" inside the panel is hidden under the minimap during horizontal scroll too.
 *
 * Solution: append a single `.cm-git-panel-floatbar` directly to `view.dom` (the `.cm-editor` root, which does
 * NOT scroll). Position it `right: 0` (CSS shifts to `right: 50px` when the minimap is enabled — see CSS) and
 * track the active panel's screen-Y for `top` via `getBoundingClientRect`. One overlay element, rebuilt with
 * fresh button handlers when the active chunk changes.
 *
 * Active-chunk resolution (same logic as the previous hover plugin):
 *   - Direct hover on `.cm-git-diff-panel` → read its `data-chunk-index`.
 *   - Hover on the floatbar itself → keep the current chunk active (so users can move from line to button).
 *   - Otherwise → `view.posAtCoords({ x: 0, y })` to convert pointer Y to a doc line, walk against
 *     `selectedIndices` to find the chunk that contains it.
 *
 * Only EXPANDED chunks (in `gs.selectedIndices`) ever become active.
 */
const gitHunkFloatbarOverlay = ViewPlugin.fromClass(
  class {
    private readonly el: HTMLDivElement;
    private currentChunk: number | null = null;
    private readonly onMove: (e: PointerEvent) => void;
    private readonly onLeave: (e: PointerEvent) => void;
    private readonly onScroll: () => void;

    constructor(readonly view: EditorView) {
      this.el = document.createElement('div');
      this.el.className = 'cm-git-panel-floatbar';
      this.el.style.display = 'none';
      // Append to `view.dom` (the .cm-editor root) — NOT scrollDOM. scrollDOM's absolute children scroll along
      // with the content (their coords are inside the scrollable area), so they wouldn't stay pinned to the
      // viewport edge during horizontal scroll. view.dom doesn't scroll → stays put → we just update `top`.
      view.dom.appendChild(this.el);

      this.onMove = (e: PointerEvent) => {
        const gs = view.state.field(gitGutterStateField);
        if (gs.selectedIndices.size === 0) {
          this.setActive(null);
          return;
        }
        const el = e.target as HTMLElement | null;

        // Hovering the floatbar itself? Keep the current chunk active so users can move from a line to a button
        // without the bar disappearing on transit.
        if (el?.closest?.('.cm-git-panel-floatbar')) return;

        // 1) Direct panel hover wins.
        const panelEl = el?.closest?.('.cm-git-diff-panel') as HTMLElement | null;
        if (panelEl?.dataset.chunkIndex != null) {
          const idx = Number(panelEl.dataset.chunkIndex);
          if (Number.isFinite(idx)) {
            this.setActive(idx);
            return;
          }
        }

        // 2) Resolve via Y → doc line → chunk. `x: 0` so the lookup works even when the pointer is over the
        //    gutters (which have no doc content); `false` for `precise` returns the closest line.
        const pos = view.posAtCoords({ x: 0, y: e.clientY }, false);
        if (pos != null && pos >= 0 && pos <= view.state.doc.length) {
          const lineNo = view.state.doc.lineAt(pos).number;
          for (let i = 0; i < gs.chunks.length; i++) {
            if (!gs.selectedIndices.has(i)) continue;
            const ch = gs.chunks[i]!;
            const range = chunkDocLineRange(ch, view.state.doc);
            if (range && lineNo >= range.from && lineNo <= range.to) {
              this.setActive(i);
              return;
            }
          }
        }

        this.setActive(null);
      };
      // Clear active only when the pointer leaves the editor entirely. Internal moves (between line / gutter /
      // floatbar) are handled by `onMove`'s closest() checks.
      this.onLeave = (e: PointerEvent) => {
        if (!view.dom.contains(e.relatedTarget as Node | null)) this.setActive(null);
      };
      this.onScroll = () => this.reposition();

      view.dom.addEventListener('pointermove', this.onMove);
      view.dom.addEventListener('pointerleave', this.onLeave);
      // Vertical scroll moves the panel relative to the editor → re-snap floatbar's `top`. Horizontal scroll
      // doesn't matter (right edge is fixed via CSS) but we listen to the same scroll event for both axes.
      view.scrollDOM.addEventListener('scroll', this.onScroll, { passive: true });
    }

    update(u: ViewUpdate) {
      if (this.currentChunk === null) return;
      // External close (e.g., user dispatched closeGitSelection on this chunk) → drop active.
      const gs = u.state.field(gitGutterStateField);
      if (!gs.selectedIndices.has(this.currentChunk)) {
        this.setActive(null);
        return;
      }
      // Doc / viewport / geometry change → panel may have moved → reposition.
      if (u.docChanged || u.viewportChanged || u.geometryChanged) this.reposition();
    }

    private setActive(idx: number | null) {
      if (this.currentChunk === idx) return;
      this.currentChunk = idx;
      if (idx === null) {
        this.el.style.display = 'none';
        return;
      }
      // Rebuild content with fresh handlers bound to this chunk index. Buttons capture `chunkIndex` in their
      // closures, so we MUST recreate them whenever the active chunk changes — reusing across chunks would
      // dispatch effects against the wrong index.
      while (this.el.firstChild) this.el.removeChild(this.el.firstChild);
      this.el.appendChild(buildFloatbarActions(this.view, idx));
      this.el.style.display = '';
      this.reposition();
    }

    private reposition() {
      if (this.currentChunk === null) return;
      const panel = this.view.dom.querySelector<HTMLElement>(
        `.cm-git-diff-panel[data-chunk-index="${this.currentChunk}"]`,
      );
      if (!panel) {
        this.el.style.display = 'none';
        return;
      }
      const panelRect = panel.getBoundingClientRect();
      const scrollerRect = this.view.scrollDOM.getBoundingClientRect();
      // Panel fully out of the visible scroller viewport → hide. Avoids a floatbar floating in dead space when
      // the user scrolls the chunk far above / below the editor.
      if (panelRect.bottom < scrollerRect.top || panelRect.top > scrollerRect.bottom) {
        this.el.style.display = 'none';
        return;
      }
      this.el.style.display = '';
      // `top` in view.dom coordinates = panel's screen-Y minus editor's screen-Y. Both rects are in viewport
      // space, so the subtraction gives a delta independent of page scroll.
      const editorRect = this.view.dom.getBoundingClientRect();
      this.el.style.top = `${panelRect.top - editorRect.top}px`;
    }

    destroy() {
      this.view.dom.removeEventListener('pointermove', this.onMove);
      this.view.dom.removeEventListener('pointerleave', this.onLeave);
      this.view.scrollDOM.removeEventListener('scroll', this.onScroll);
      this.el.remove();
    }
  },
);

/**
 * `elementClass`-only marker — paints the chunk tint on every gutter cell that aligns with a `DiffPanelWidget`,
 * via the `gutterWidgetClass` facet (see `panelCellBgGutterClass` below). This is the mechanism that makes the
 * red bg "bleed" across line-numbers + fold + change-gutter for the panel widget without us having to touch
 * `.cm-gutters` global background. Keeping `.cm-gutters` opaque is important so that horizontally-scrolled code
 * doesn't show through the line-number column.
 *
 * Two markers (one per chunk kind) so a single class name carries the chunk tint — CSS-only, no DOM nodes.
 */
class GitPanelCellBgMarker extends GutterMarker {
  constructor(readonly chunkKind: 'added' | 'deleted' | 'modified') {
    super();
    this.elementClass = `cm-git-panel-cell cm-git-panel-cell-${chunkKind}`;
  }
  override eq(other: GutterMarker): boolean {
    return other instanceof GitPanelCellBgMarker && other.chunkKind === this.chunkKind;
  }
}

const PANEL_CELL_BG_DELETED = new GitPanelCellBgMarker('deleted');
const PANEL_CELL_BG_MODIFIED = new GitPanelCellBgMarker('modified');

const panelCellBgGutterClass = gutterWidgetClass.of((view, widget) => {
  if (!(widget instanceof DiffPanelWidget)) return null;
  const gs = view.state.field(gitGutterStateField);
  const ch = gs.chunks[widget.chunkIndex];
  if (!ch) return null;
  const kind = classifyChunkKind(ch);
  if (kind === 'added') return null;
  return kind === 'modified' ? PANEL_CELL_BG_MODIFIED : PANEL_CELL_BG_DELETED;
});

const gitChangeGutter = gutter({
  class: 'cm-git-change-gutter',
  lineMarker(view, line) {
    const host = view.state.facet(gitGutterHostFacet);
    if (!host) return null;
    const gs = view.state.field(gitGutterStateField);
    if (!gs.chunks.length) return null;
    const lineNo = view.state.doc.lineAt(line.from).number;
    for (let i = 0; i < gs.chunks.length; i++) {
      const ch = gs.chunks[i]!;
      const range = chunkDocLineRange(ch, view.state.doc);
      if (range && lineNo >= range.from && lineNo <= range.to) {
        const kind = classifyChunkKind(ch);
        const expanded = gs.selectedIndices.has(i);
        if (kind === 'deleted') {
          // Expanded → no per-line seam (the panel widget already paints the deleted content).
          if (expanded) continue;
          return new GitDeletedSeamGutterMarker(i);
        }
        return new GitChunkBarMarker(i, kind, expanded);
      }
    }
    return null;
  },
  widgetMarker(view, widget) {
    // Render the bar in the panel widget's gutter cell using the same `GitChunkBarMarker` we use for editor lines.
    // This guarantees pixel-perfect alignment with the bars on the lines below — no manual positioning needed.
    if (!(widget instanceof DiffPanelWidget)) return null;
    const gs = view.state.field(gitGutterStateField);
    const ch = gs.chunks[widget.chunkIndex];
    if (!ch) return null;
    const kind = classifyChunkKind(ch);
    return new GitChunkBarMarker(widget.chunkIndex, kind, true);
  },
  lineMarkerChange: (update: ViewUpdate) =>
    update.docChanged ||
    update.transactions.some((tr) =>
      tr.effects.some(
        (e) =>
          e.is(toggleGitSelection) ||
          e.is(openGitSelection) ||
          e.is(closeGitSelection) ||
          e.is(clearGitSelections),
      ),
    ),
});

/**
 * Git gutter: per-line bars, line backgrounds, expandable hunk panel above the first line.
 */
export function createGitChangeGutterExtensions(host: GitGutterHost): Extension[] {
  return [
    gitGutterHostFacet.of(host),
    gitGutterStateField,
    gitDiffLineGutterHighlighter,
    gitDiffDecorationsField,
    gitHunkFloatbarOverlay,
    gitChangeGutter,
    panelCellBgGutterClass,
    gitGutterTheme,
  ];
}
