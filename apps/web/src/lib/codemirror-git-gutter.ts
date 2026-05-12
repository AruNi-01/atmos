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
  gutterLineClass,
  type DecorationSet,
  type ViewUpdate,
  gutter,
} from '@codemirror/view';
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

/** Fills the tall gutter cell for a {@link DiffPanelWidget} so tint reaches the strip (no “black gap”). */
class GitDiffPanelGutterMarker extends GutterMarker {
  constructor(readonly chunkIndex: number) {
    super();
  }

  override eq(other: GutterMarker): boolean {
    return other instanceof GitDiffPanelGutterMarker && other.chunkIndex === this.chunkIndex;
  }

  override toDOM(view: EditorView): HTMLElement {
    const root = document.createElement('div');
    root.className = 'cm-git-diff-panel-widget-gutter';

    const gs = view.state.field(gitGutterStateField);
    const ch = gs.chunks[this.chunkIndex];
    if (!ch) return root;

    const kind = classifyChunkKind(ch);

    const R = 'rgba(239, 68, 68, 0.16)';
    const G = 'rgba(34, 197, 94, 0.15)';
    const Y = 'rgba(234, 179, 8, 0.14)';

    if (kind === 'modified') {
      root.style.background = Y;
    } else if (kind === 'added') {
      root.style.background = G;
    } else if (kind === 'deleted') {
      root.style.background = R;
    } else {
      root.style.background = Y;
    }

    const barKind =
      kind === 'added' ? 'added' : kind === 'deleted' ? 'deleted' : 'modified';
    const hit = document.createElement('div');
    hit.className =
      'cm-git-gutter-bar-hit cm-git-gutter-bar-hit--panel-widget cm-git-active-hunk-target';
    hit.setAttribute('role', 'button');
    hit.tabIndex = 0;
    hit.setAttribute('aria-label', 'Toggle inline diff for this change');

    const chunkIndex = this.chunkIndex;
    const toggle = () => {
      const st = view.state.field(gitGutterStateField);
      const next = st.selectedIndex === chunkIndex ? null : chunkIndex;
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

    const bar = document.createElement('div');
    bar.className = `cm-git-gutter-bar cm-git-gutter-${barKind} cm-git-gutter-bar-expanded`;
    hit.appendChild(bar);
    root.appendChild(hit);
    return root;
  }
}

function appendSolidPanelRow(body: HTMLElement, text: string, side: 'old' | 'new') {
  const row = document.createElement('div');
  row.className = `cm-git-panel-line cm-git-panel-${side}`;
  row.textContent = text;
  body.appendChild(row);
}

function fillDiffPanelBody(
  body: HTMLElement,
  kind: 'added' | 'deleted' | 'modified',
  oldLines: string[],
  newLines: string[],
) {
  if (kind === 'added') {
    return;
  }
  if (kind === 'deleted') {
    for (const line of oldLines) appendSolidPanelRow(body, line, 'old');
    return;
  }
  // modified: only the removed side in the panel; the buffer already shows the new side (green line highlight).
  for (const line of oldLines) appendSolidPanelRow(body, line, 'old');
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

    const newLines = sliceLines(doc, chunk.fromB, chunk.toB);
    const chunkKind = classifyChunkKind(chunk);
    fillDiffPanelBody(body, chunkKind, oldLines, newLines);

    wrap.appendChild(floatbar);
    wrap.appendChild(body);

    body.setAttribute('contenteditable', 'false');
    body.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    const applyGutterBleed = () => {
      const gutters = view.scrollDOM.querySelector('.cm-gutters');
      const w = gutters ? Math.round(gutters.getBoundingClientRect().width) : 0;
      wrap.style.setProperty('--cm-git-gutters-bleed', `${w}px`);
    };
    applyGutterBleed();
    const ro = new ResizeObserver(() => applyGutterBleed());
    ro.observe(view.scrollDOM);
    (wrap as HTMLElement & { _cmGitBleedRo?: ResizeObserver })._cmGitBleedRo = ro;
    requestAnimationFrame(applyGutterBleed);

    return wrap;
  }

  override destroy(dom: HTMLElement): void {
    const el = dom as HTMLElement & { _cmGitBleedRo?: ResizeObserver };
    el._cmGitBleedRo?.disconnect();
    delete el._cmGitBleedRo;
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
  '.cm-git-line-bg-expanded': {
    filter: 'brightness(1.04)',
  },
  // Keep change gutter above panel bleed so the strip stays visible; body margin (below) avoids hit-stealing.
  '.cm-editor .cm-gutters': {
    position: 'relative',
    zIndex: '20',
  },
  '.cm-git-diff-panel-widget-gutter': {
    width: '100%',
    height: '100%',
    minHeight: '100%',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  '.cm-git-gutter-bar-hit--panel-widget': {
    width: '100%',
    display: 'flex',
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  '.cm-editor .cm-gutters .cm-gutter': {
    borderInlineEnd: 'none',
  },
  '.cm-git-diff-panel': {
    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
    fontSize: '12px',
    boxSizing: 'border-box',
    position: 'relative',
    zIndex: '6',
    marginLeft: 'calc(-1 * var(--cm-git-gutters-bleed, 0px))',
    width: 'calc(100% + var(--cm-git-gutters-bleed, 0px))',
    marginTop: '0',
    marginBottom: '0',
    paddingTop: '0',
    paddingBottom: '0',
    border: 'none',
    background: 'transparent',
    pointerEvents: 'none',
  },
  // Let clicks reach the gutter: bleed overlaps gutter column — neutralize hits on the line tree except panel text + toolbar.
  '.cm-line:has(.cm-git-diff-panel)': {
    paddingTop: '0',
    paddingBottom: '0',
    marginTop: '0',
    marginBottom: '0',
    pointerEvents: 'none',
  },
  '.cm-line:has(.cm-git-diff-panel) *': {
    pointerEvents: 'none',
  },
  '.cm-line:has(.cm-git-diff-panel) .cm-git-panel-body': {
    pointerEvents: 'auto',
  },
  '.cm-line:has(.cm-git-diff-panel) .cm-git-panel-body *': {
    pointerEvents: 'auto',
  },
  '.cm-line:has(.cm-git-diff-panel) .cm-git-panel-floatbar': {
    pointerEvents: 'none',
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
  '.cm-git-panel-body': {
    marginLeft: 'var(--cm-git-gutters-bleed, 0px)',
    paddingTop: '0',
    paddingBottom: '2px',
    paddingLeft: '0',
    paddingRight: '128px',
    maxHeight: '220px',
    overflowY: 'auto',
    userSelect: 'text',
    cursor: 'text',
    WebkitUserSelect: 'text',
    pointerEvents: 'auto',
    boxSizing: 'border-box',
  },
  '.cm-git-panel-line': {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    paddingTop: '2px',
    paddingBottom: '2px',
    paddingLeft: '6px',
    paddingRight: '6px',
    margin: '0',
    borderRadius: '0',
  },
  '.cm-git-panel-old': {
    background: 'rgba(239, 68, 68, 0.14)',
  },
  '.cm-git-panel-new': {
    background: 'rgba(34, 197, 94, 0.12)',
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
    if (widget instanceof DiffPanelWidget) return new GitDiffPanelGutterMarker(widget.chunkIndex);
    return null;
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
    gitGutterTheme,
  ];
}
