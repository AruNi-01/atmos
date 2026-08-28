import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import {
  Editor,
  editorViewCtx,
  rootCtx,
  defaultValueCtx,
} from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { CellSelection } from "@milkdown/kit/prose/tables";
import type { Node } from "@milkdown/kit/prose/model";
import {
  isMdLiveFullTableSelection,
  mdLiveDeleteFullTable,
  mdLiveDeleteTableSelection,
  mdLiveFirstTablePos,
  mdLiveTableAddCol,
  mdLiveTableAddRow,
  mdLiveTableDeleteCol,
  mdLiveTableDeletePlugin,
  mdLiveTableDeleteRow,
  mdLiveTableViewPlugin,
} from "@atmos/md-live/ui";

const TABLE = `| A | B |
| --- | --- |
| 1 | 2 |
| 3 | 4 |
`;

let previousWindow: PropertyDescriptor | undefined;
let previousDocument: PropertyDescriptor | undefined;

function installDom(): void {
  const win = new Window({ url: "https://app.atmos.local/" });
  previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: win,
    writable: true,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: win.document,
    writable: true,
  });
}

function restoreDom(): void {
  if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
  else delete (globalThis as { window?: unknown }).window;
  if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
  else delete (globalThis as { document?: unknown }).document;
}

async function createEditor(source = TABLE) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, host);
      ctx.set(defaultValueCtx, source);
    })
    .use(commonmark)
    .use(mdLiveTableDeletePlugin)
    .use(gfm)
    .use(mdLiveTableViewPlugin(() => undefined));
  await editor.create();
  return { editor, host };
}

function tableShape(doc: Node): { rows: number; cols: number } | null {
  let found: { rows: number; cols: number } | null = null;
  doc.descendants((node) => {
    if (found != null) return false;
    if (node.type.name !== "table") return true;
    found = {
      rows: node.childCount,
      cols: node.firstChild?.childCount ?? 0,
    };
    return false;
  });
  return found;
}

function cellTexts(doc: Node): string[] {
  const texts: string[] = [];
  doc.descendants((node) => {
    if (node.type.name === "table_cell" || node.type.name === "table_header") {
      texts.push(node.textContent);
    }
  });
  return texts;
}

function cellAt(doc: Node, tablePos: number, row: number, col: number): number {
  const table = doc.nodeAt(tablePos);
  if (!table) throw new Error("missing table node");
  let pos = tablePos + 1;
  for (let index = 0; index < row; index += 1) pos += table.child(index).nodeSize;
  pos += 1;
  const rowNode = table.child(row);
  for (let index = 0; index < col; index += 1) pos += rowNode.child(index).nodeSize;
  return pos;
}

function selectCells(
  editor: Editor,
  fromRow: number,
  fromCol: number,
  toRow: number,
  toCol: number,
): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const tablePos = mdLiveFirstTablePos(view.state.doc);
    if (tablePos == null) throw new Error("missing table");
    const anchor = cellAt(view.state.doc, tablePos, fromRow, fromCol);
    const head = cellAt(view.state.doc, tablePos, toRow, toCol);
    view.dispatch(view.state.tr.setSelection(CellSelection.create(view.state.doc, anchor, head)));
  });
}

function applySelectionDelete(editor: Editor): boolean {
  return editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const tr = mdLiveDeleteTableSelection(view.state);
    if (!tr) return false;
    view.dispatch(tr);
    return true;
  });
}

function selectAllCells(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const { doc } = view.state;
    let first: number | null = null;
    let last: number | null = null;
    doc.descendants((node, pos) => {
      if (node.type.name === "table_cell" || node.type.name === "table_header") {
        if (first == null) first = pos;
        last = pos;
      }
    });
    if (first == null || last == null) throw new Error("missing cells");
    view.dispatch(view.state.tr.setSelection(CellSelection.create(doc, last, first)));
  });
}

describe("md-live table ops", () => {
  beforeEach(() => {
    installDom();
  });

  afterEach(() => {
    restoreDom();
  });

  test("selecting every cell then backspace removes the table", async () => {
    const { editor, host } = await createEditor();
    selectAllCells(editor);
    const removed = editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      expect(isMdLiveFullTableSelection(view.state)).toBe(true);
      const tr = mdLiveDeleteFullTable(view.state);
      expect(tr).not.toBeNull();
      if (tr) view.dispatch(tr);
      return mdLiveFirstTablePos(view.state.doc);
    });
    expect(removed).toBeNull();
    expect(host.querySelector("table")).toBeNull();
    await editor.destroy();
  });

  test("handleKeyDown deletes a fully selected table on Delete", async () => {
    const { editor } = await createEditor();
    selectAllCells(editor);
    const handled = editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const event = new window.KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true });
      const result = view.someProp("handleKeyDown", (fn) => fn(view, event));
      return { result, table: mdLiveFirstTablePos(view.state.doc) };
    });
    expect(handled.result).toBe(true);
    expect(handled.table).toBeNull();
    await editor.destroy();
  });

  test("partial cell selection does not delete the table", async () => {
    const { editor } = await createEditor();
    const kept = editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const { doc } = view.state;
      let first: number | null = null;
      doc.descendants((node, pos) => {
        if (first != null) return false;
        if (node.type.name === "table_header") {
          first = pos;
          return false;
        }
        return true;
      });
      if (first == null) throw new Error("missing header cell");
      view.dispatch(view.state.tr.setSelection(CellSelection.create(doc, first)));
      expect(mdLiveDeleteFullTable(view.state)).toBeNull();
      return mdLiveFirstTablePos(view.state.doc);
    });
    expect(kept).not.toBeNull();
    await editor.destroy();
  });

  test("adding a row above the header keeps a header row", async () => {
    const { editor } = await createEditor();
    const after = editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const pos = mdLiveFirstTablePos(view.state.doc);
      if (pos == null) throw new Error("missing table");
      const tr = mdLiveTableAddRow(view.state, pos, 0, "before");
      if (!tr) throw new Error("add header row failed");
      view.dispatch(tr);
      const tablePos = mdLiveFirstTablePos(view.state.doc);
      if (tablePos == null) throw new Error("missing table after insert");
      const table = view.state.doc.nodeAt(tablePos);
      return {
        shape: tableShape(view.state.doc),
        header: table?.firstChild?.type.name,
        second: table?.childCount ? table.child(1)?.type.name : null,
      };
    });
    expect(after.shape).toEqual({ rows: 4, cols: 2 });
    expect(after.header).toBe("table_header_row");
    expect(after.second).toBe("table_row");
    await editor.destroy();
  });

  test("adds a row below and a column to the right", async () => {
    const { editor } = await createEditor();
    const after = editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const pos = mdLiveFirstTablePos(view.state.doc);
      if (pos == null) throw new Error("missing table");
      const rowTr = mdLiveTableAddRow(view.state, pos, 1, "after");
      if (!rowTr) throw new Error("add row failed");
      view.dispatch(rowTr);
      const nextPos = mdLiveFirstTablePos(view.state.doc);
      if (nextPos == null) throw new Error("missing table after row");
      const colTr = mdLiveTableAddCol(view.state, nextPos, 1, "after");
      if (!colTr) throw new Error("add col failed");
      view.dispatch(colTr);
      return tableShape(view.state.doc);
    });
    expect(after).toEqual({ rows: 4, cols: 3 });
    await editor.destroy();
  });

  test("deleting the last extra body row keeps a valid table, then deleting again removes it", async () => {
    const { editor } = await createEditor();
    const first = editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const pos = mdLiveFirstTablePos(view.state.doc);
      if (pos == null) throw new Error("missing table");
      const tr = mdLiveTableDeleteRow(view.state, pos, 2);
      if (!tr) throw new Error("delete row failed");
      view.dispatch(tr);
      return tableShape(view.state.doc);
    });
    expect(first).toEqual({ rows: 2, cols: 2 });
    const second = editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const pos = mdLiveFirstTablePos(view.state.doc);
      if (pos == null) throw new Error("missing table");
      const tr = mdLiveTableDeleteRow(view.state, pos, 1);
      if (!tr) throw new Error("delete last rows failed");
      view.dispatch(tr);
      return mdLiveFirstTablePos(view.state.doc);
    });
    expect(second).toBeNull();
    await editor.destroy();
  });

  test("deleting a column shrinks the table", async () => {
    const { editor } = await createEditor();
    const after = editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const pos = mdLiveFirstTablePos(view.state.doc);
      if (pos == null) throw new Error("missing table");
      const tr = mdLiveTableDeleteCol(view.state, pos, 1);
      if (!tr) throw new Error("delete col failed");
      view.dispatch(tr);
      return tableShape(view.state.doc);
    });
    expect(after).toEqual({ rows: 3, cols: 1 });
    await editor.destroy();
  });

  test("deleting a fully selected column removes the column, not just its text", async () => {
    const { editor } = await createEditor();
    selectCells(editor, 0, 1, 2, 1);
    expect(applySelectionDelete(editor)).toBe(true);
    expect(tableShape(editor.action((ctx) => ctx.get(editorViewCtx).state.doc))).toEqual({ rows: 3, cols: 1 });
    expect(cellTexts(editor.action((ctx) => ctx.get(editorViewCtx).state.doc))).toEqual(["A", "1", "3"]);
    await editor.destroy();
  });

  test("deleting a fully selected body row removes the row, not just its text", async () => {
    const { editor } = await createEditor();
    selectCells(editor, 2, 0, 2, 1);
    expect(applySelectionDelete(editor)).toBe(true);
    expect(tableShape(editor.action((ctx) => ctx.get(editorViewCtx).state.doc))).toEqual({ rows: 2, cols: 2 });
    expect(cellTexts(editor.action((ctx) => ctx.get(editorViewCtx).state.doc))).toEqual(["A", "B", "1", "2"]);
    await editor.destroy();
  });

  test("deleting two complete body rows that would leave only a header removes the table", async () => {
    const { editor } = await createEditor();
    selectCells(editor, 1, 0, 2, 1);
    expect(applySelectionDelete(editor)).toBe(true);
    expect(mdLiveFirstTablePos(editor.action((ctx) => ctx.get(editorViewCtx).state.doc))).toBeNull();
    await editor.destroy();
  });

  test("a partial cell selection does not drop rows or columns", async () => {
    const { editor } = await createEditor();
    selectCells(editor, 0, 0, 0, 0);
    expect(mdLiveDeleteTableSelection(editor.action((ctx) => ctx.get(editorViewCtx).state))).toBeNull();
    expect(tableShape(editor.action((ctx) => ctx.get(editorViewCtx).state.doc))).toEqual({ rows: 3, cols: 2 });
    expect(cellTexts(editor.action((ctx) => ctx.get(editorViewCtx).state.doc))).toEqual(["A", "B", "1", "2", "3", "4"]);
    await editor.destroy();
  });

  test("deleting two complete columns keeps the remaining column", async () => {
    const { editor } = await createEditor(`| A | B | C |
| --- | --- | --- |
| 1 | 2 | 3 |
| 4 | 5 | 6 |
`);
    selectCells(editor, 0, 1, 2, 2);
    expect(applySelectionDelete(editor)).toBe(true);
    expect(tableShape(editor.action((ctx) => ctx.get(editorViewCtx).state.doc))).toEqual({ rows: 3, cols: 1 });
    expect(cellTexts(editor.action((ctx) => ctx.get(editorViewCtx).state.doc))).toEqual(["A", "1", "4"]);
    await editor.destroy();
  });

  test("deleting the header row promotes the next row instead of emptying cells", async () => {
    const { editor } = await createEditor();
    selectCells(editor, 0, 0, 0, 1);
    expect(applySelectionDelete(editor)).toBe(true);
    expect(tableShape(editor.action((ctx) => ctx.get(editorViewCtx).state.doc))).toEqual({ rows: 2, cols: 2 });
    expect(cellTexts(editor.action((ctx) => ctx.get(editorViewCtx).state.doc))).toEqual(["1", "2", "3", "4"]);
    await editor.destroy();
  });

  test("handleKeyDown deletes a fully selected column", async () => {
    const { editor } = await createEditor();
    selectCells(editor, 0, 1, 2, 1);
    const handled = editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const event = new window.KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true });
      const result = view.someProp("handleKeyDown", (fn) => fn(view, event));
      return { result, shape: tableShape(view.state.doc), texts: cellTexts(view.state.doc) };
    });
    expect(handled.result).toBe(true);
    expect(handled.shape).toEqual({ rows: 3, cols: 1 });
    expect(handled.texts).toEqual(["A", "1", "3"]);
    await editor.destroy();
  });

  test("table chrome mounts row/col handles and add buttons", async () => {
    const { editor, host } = await createEditor();
    expect(host.querySelector(".md-live-table-frame")).not.toBeNull();
    expect(host.querySelector(".md-live-table-handle--row")).not.toBeNull();
    expect(host.querySelector(".md-live-table-handle--col")).not.toBeNull();
    expect(host.querySelector(".md-live-table-add--row")).not.toBeNull();
    expect(host.querySelector(".md-live-table-add--col")).not.toBeNull();
    expect(host.querySelector('[data-op="row-before"]')?.dataset.labelKey).toBe("tableAddRowAbove");
    expect(host.querySelector('[data-op="col-after"]')?.dataset.labelKey).toBe("tableAddColRight");
    await editor.destroy();
  });
});
