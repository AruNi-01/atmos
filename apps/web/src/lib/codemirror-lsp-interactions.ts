'use client';

import { startCompletion } from '@codemirror/autocomplete';
import { EditorSelection, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import {
  findReferences,
  formatDocument,
  jumpToDefinition,
  jumpToImplementation,
  renameSymbol,
} from '@codemirror/lsp-client';

export type LspEditorActionId =
  | 'definition'
  | 'implementation'
  | 'references'
  | 'rename'
  | 'format'
  | 'completion';

export type LspContextMenuRequest = {
  x: number;
  y: number;
  pos: number;
};

function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.platform.toLowerCase().includes('mac');
}

function isPrimaryNavigationClick(event: MouseEvent): boolean {
  if (event.button !== 0) return false;
  return isMacPlatform() ? event.metaKey : event.ctrlKey;
}

function ensureActionPosition(view: EditorView, pos: number) {
  const selection = view.state.selection.main;
  if (selection.from <= pos && pos <= selection.to) {
    return;
  }

  view.dispatch({
    selection: EditorSelection.single(pos),
    scrollIntoView: false,
  });
}

export function runLspEditorAction(
  view: EditorView,
  action: LspEditorActionId,
  pos?: number,
): boolean {
  if (typeof pos === 'number') {
    ensureActionPosition(view, pos);
  }

  view.focus();

  switch (action) {
    case 'definition':
      return jumpToDefinition(view);
    case 'implementation':
      return jumpToImplementation(view);
    case 'references':
      return findReferences(view);
    case 'rename':
      return renameSymbol(view);
    case 'format':
      return formatDocument(view);
    case 'completion':
      return startCompletion(view);
    default:
      return false;
  }
}

export function createLspInteractionExtension(config: {
  onContextMenu: (request: LspContextMenuRequest) => void;
}): Extension {
  return [
    keymap.of([
      { key: 'Ctrl-Space', run: startCompletion, preventDefault: true },
      { key: 'Mod-F12', run: jumpToImplementation, preventDefault: true },
    ]),
    EditorView.domEventHandlers({
      mousedown(event, view) {
        if (!isPrimaryNavigationClick(event)) return false;

        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos == null || !view.state.wordAt(pos)) return false;

        event.preventDefault();
        return runLspEditorAction(view, 'definition', pos);
      },
      contextmenu(event, view) {
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos == null) return false;

        event.preventDefault();
        ensureActionPosition(view, pos);
        config.onContextMenu({
          x: event.clientX,
          y: event.clientY,
          pos,
        });
        return true;
      },
    }),
  ];
}

export function lspActionLabel(action: LspEditorActionId): string {
  switch (action) {
    case 'definition':
      return 'Go to Definition';
    case 'implementation':
      return 'Go to Implementation';
    case 'references':
      return 'Find References';
    case 'rename':
      return 'Rename Symbol';
    case 'format':
      return 'Format Document';
    case 'completion':
      return 'Trigger Completion';
    default:
      return 'Run LSP Action';
  }
}

export function lspActionShortcut(action: LspEditorActionId): string | null {
  switch (action) {
    case 'definition':
      return isMacPlatform() ? 'Cmd+Click / F12' : 'Ctrl+Click / F12';
    case 'implementation':
      return isMacPlatform() ? 'Cmd+F12' : 'Ctrl+F12';
    case 'references':
      return 'Shift+F12';
    case 'rename':
      return 'F2';
    case 'format':
      return 'Shift+Alt+F';
    case 'completion':
      return 'Ctrl+Space';
    default:
      return null;
  }
}
