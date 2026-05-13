import { Facet, RangeSet, type EditorState, type Range } from '@codemirror/state';
import { EditorView, GutterMarker, gutterLineClass } from '@codemirror/view';

/**
 * Extend the visible selection background across every gutter (line numbers, fold gutter, change gutter).
 *
 * `gutterLineClass` is global across all gutters — the marker's `elementClass` lights up each gutter element
 * on lines that intersect any non-empty selection range, so the visible bar lines up with `.cm-selectionBackground`.
 */
class SelectionGutterMarker extends GutterMarker {
  constructor() {
    super();
    this.elementClass = 'cm-selection-line-gutter';
  }

  override eq(other: GutterMarker): boolean {
    return other instanceof SelectionGutterMarker;
  }
}

const SHARED_MARKER = new SelectionGutterMarker();

const selectionGutterLineFacet = Facet.define<null>();

const selectionGutterLineCompute = gutterLineClass.compute(['selection', 'doc'], (state: EditorState) => {
  const marks: Range<GutterMarker>[] = [];
  for (const range of state.selection.ranges) {
    if (range.empty) continue;
    const fromLine = state.doc.lineAt(range.from).number;
    const toLine = state.doc.lineAt(range.to).number;
    for (let n = fromLine; n <= toLine; n++) {
      const line = state.doc.line(n);
      marks.push(SHARED_MARKER.range(line.from));
    }
  }
  return RangeSet.of(marks, true);
});

const selectionGutterTheme = EditorView.baseTheme({
  '.cm-gutterElement.cm-selection-line-gutter': {
    backgroundColor: 'rgba(127, 127, 127, 0.32)',
  },
  '&dark .cm-gutterElement.cm-selection-line-gutter': {
    backgroundColor: 'rgba(63, 63, 70, 0.85)',
  },
  '&light .cm-gutterElement.cm-selection-line-gutter': {
    backgroundColor: 'rgba(212, 212, 216, 0.85)',
  },
});

export function selectionGutterExtension() {
  return [selectionGutterLineFacet.of(null), selectionGutterLineCompute, selectionGutterTheme];
}
