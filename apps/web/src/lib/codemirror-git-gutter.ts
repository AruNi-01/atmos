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

const setGitSelection = StateEffect.define<number | null>();

interface GitGutterState {
  original: Text;
  chunks: readonly Chunk[];
  selectedIndex: number | null;
}

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
      const st = view.state.field(gitGutterStateField);
      const next = st.selectedIndex === this.chunkIndex ? null : this.chunkIndex;
      view.dispatch({ effects: setGitSelection.of(next) });
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
function appendHighlightedOldRows(view: EditorView, body: HTMLElement, oldLines: string[]) {
  const text = oldLines.join('\n');
  const pre = document.createElement('pre');
  pre.className = 'cm-git-panel-pre';
  body.appendChild(pre);

  const append = (from: number, to: number, cls: string) => {
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
) {
  if (kind === 'added') return;
  // For both `deleted` and `modified` we only show the removed side in the panel — the buffer already shows the
  // new side (green line tint). Git only knows additions and deletions; "modified" is the union.
  appendHighlightedOldRows(view, body, oldLines);
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
      const st = view.state.field(gitGutterStateField);
      const next = st.selectedIndex === this.chunkIndex ? null : this.chunkIndex;
      view.dispatch({ effects: setGitSelection.of(next) });
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

    const host = view.state.facet(gitGutterHostFacet);
    const gs = view.state.field(gitGutterStateField);
    const chunk = gs.chunks[this.chunkIndex];
    if (!host || !chunk) return wrap;

    const original = gs.original;
    const doc = view.state.doc;
    const oldLines = sliceLines(original, chunk.fromA, chunk.toA);

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

    const close = mkBtn('×', 'Close panel', () => view.dispatch({ effects: setGitSelection.of(null) }));
    close.className = 'cm-git-panel-float-close';

    const prev = mkBtn(
      '↑',
      'Previous change',
      () => {
        if (!gs.chunks.length) return;
        const idx = (this.chunkIndex - 1 + gs.chunks.length) % gs.chunks.length;
        view.dispatch({ effects: setGitSelection.of(idx) });
      },
      gs.chunks.length <= 1,
    );

    const next = mkBtn(
      '↓',
      'Next change',
      () => {
        if (!gs.chunks.length) return;
        const idx = (this.chunkIndex + 1) % gs.chunks.length;
        view.dispatch({ effects: setGitSelection.of(idx) });
      },
      gs.chunks.length <= 1,
    );

    const actions = document.createElement('div');
    actions.className = 'cm-git-panel-actions';

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
      view.dispatch({ effects: setGitSelection.of(null) });
      // Caller bumps diff refresh via compartment / parent state.
    };

    const stageBtn = mkBtn('Stage', 'Stage this change', () => void runPatch('stage'));

    const restoreBtn = mkBtn(
      'Restore',
      isUntrackedNew ? 'Cannot restore untracked files' : 'Discard this unstaged hunk',
      () => void runPatch('restore'),
      isUntrackedNew,
    );

    actions.append(stageBtn, restoreBtn, next, prev, close);

    const floatbar = document.createElement('div');
    floatbar.className = 'cm-git-panel-floatbar';
    floatbar.appendChild(actions);

    const body = document.createElement('div');
    body.className = 'cm-git-panel-body';

    const chunkKind = classifyChunkKind(chunk);
    fillDiffPanelBody(view, body, chunkKind, oldLines);

    wrap.appendChild(floatbar);

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

function textFromStringContent(s: string): Text {
  if (!s) return Text.empty;
  return Text.of(s.replace(/\r\n/g, '\n').split('\n'));
}

const gitGutterStateField = StateField.define<GitGutterState>({
  create(state) {
    const host = state.facet(gitGutterHostFacet);
    if (!host) {
      return { original: Text.empty, chunks: [], selectedIndex: null };
    }
    const original = textFromStringContent(host.originalContent);
    return {
      original,
      chunks: Chunk.build(original, state.doc, DIFF_CFG),
      selectedIndex: null,
    };
  },
  update(value, tr: Transaction) {
    let { original, chunks, selectedIndex } = value;

    for (const e of tr.effects) {
      if (e.is(setGitSelection)) {
        selectedIndex = e.value;
      }
    }

    const host = tr.state.facet(gitGutterHostFacet);
    if (!host) {
      return { original: Text.empty, chunks: [], selectedIndex: null };
    }

    const nextOriginal = textFromStringContent(host.originalContent);
    if (nextOriginal.toString() !== original.toString()) {
      original = nextOriginal;
      chunks = Chunk.build(original, tr.state.doc, DIFF_CFG);
      selectedIndex = null;
    } else if (tr.docChanged && chunks.length) {
      chunks = Chunk.updateB(chunks, original, tr.state.doc, tr.changes, DIFF_CFG);
    }

    if (selectedIndex !== null && selectedIndex >= chunks.length) {
      selectedIndex = chunks.length ? chunks.length - 1 : null;
    }

    return { original, chunks, selectedIndex };
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
  '.cm-editor .cm-gutters .cm-gutter': {
    borderInlineEnd: 'none',
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
  '.cm-editor.cm-git-hunk-ui-hover .cm-git-panel-floatbar, .cm-git-panel-floatbar:focus-within': {
    opacity: '1',
    pointerEvents: 'auto',
  },
  '.cm-git-panel-floatbar': {
    position: 'absolute',
    top: '6px',
    right: '10px',
    zIndex: '10',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    opacity: '0',
    pointerEvents: 'none',
    transition: 'opacity 0.14s ease',
    borderRadius: '8px',
    padding: '3px 4px',
    gap: '2px',
    background: 'rgba(10, 10, 12, 0.92)',
    color: '#f4f4f5',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    boxShadow: '0 4px 18px rgba(0, 0, 0, 0.35)',
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

/** Lines in the document (`line.from`) that belong to the currently expanded git hunk. */
function forEachExpandedGitDiffLine(state: EditorState, fn: (lineFrom: number) => void): void {
  const gs = state.field(gitGutterStateField);
  for (let i = 0; i < gs.chunks.length; i++) {
    const ch = gs.chunks[i]!;
    if (gs.selectedIndex !== i) continue;
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

  if (gs.selectedIndex !== null && state.doc.length > 0) {
    const ch = gs.chunks[gs.selectedIndex];
    if (ch) {
      const lineFrom = chunkFirstLineFrom(ch, state.doc);
      parts.push(
        Decoration.widget({
          widget: new DiffPanelWidget(gs.selectedIndex),
          block: true,
          side: -1,
        }).range(lineFrom),
      );
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
 * Float bar is `position:absolute`; show it when the pointer is anywhere on the expanded hunk
 * (inline panel, tinted content lines, or matching gutter cells), not only over the panel strip.
 */
const gitHunkFloatbarHover = ViewPlugin.fromClass(
  class {
    private readonly onMove: (e: PointerEvent) => void;
    private readonly onLeave: () => void;

    constructor(readonly view: EditorView) {
      this.onMove = (e: PointerEvent) => {
        if (this.view.state.field(gitGutterStateField).selectedIndex == null) {
          this.view.dom.classList.remove('cm-git-hunk-ui-hover');
          return;
        }
        const el = e.target as HTMLElement | null;
        const over =
          !!el?.closest?.('.cm-git-diff-panel') ||
          !!el?.closest?.('.cm-line.cm-git-active-hunk-target') ||
          !!el?.closest?.('.cm-gutterElement.cm-git-active-hunk-target');
        this.view.dom.classList.toggle('cm-git-hunk-ui-hover', over);
      };
      this.onLeave = () => {
        this.view.dom.classList.remove('cm-git-hunk-ui-hover');
      };
      view.scrollDOM.addEventListener('pointermove', this.onMove);
      view.scrollDOM.addEventListener('pointerleave', this.onLeave);
    }

    destroy() {
      this.view.scrollDOM.removeEventListener('pointermove', this.onMove);
      this.view.scrollDOM.removeEventListener('pointerleave', this.onLeave);
      this.view.dom.classList.remove('cm-git-hunk-ui-hover');
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
        if (kind === 'deleted') {
          if (gs.selectedIndex === i) continue;
          return new GitDeletedSeamGutterMarker(i);
        }
        return new GitChunkBarMarker(i, kind, gs.selectedIndex === i);
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
    update.transactions.some((tr) => tr.effects.some((e) => e.is(setGitSelection))),
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
    gitHunkFloatbarHover,
    gitChangeGutter,
    panelCellBgGutterClass,
    gitGutterTheme,
  ];
}
