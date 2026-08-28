import type { Node } from "@milkdown/kit/prose/model";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import {
  addColumn,
  removeColumn,
  removeRow,
  TableMap,
  type TableRect,
} from "@milkdown/kit/prose/tables";
import { $prose } from "@milkdown/kit/utils";

type CellSelectionLike = {
  isRowSelection: () => boolean;
  isColSelection: () => boolean;
  $anchorCell: { pos: number };
  $headCell: { pos: number };
};

type TableInfo = {
  table: Node;
  tablePos: number;
  tableStart: number;
  map: TableMap;
};

export function mdLiveTableAtScrollEnd(
  scrollLeft: number,
  clientWidth: number,
  scrollWidth: number,
  slack = 8,
): boolean {
  return scrollLeft + clientWidth >= scrollWidth - slack;
}

export function isMdLiveCellSelection(sel: unknown): sel is CellSelectionLike {
  if (!sel || typeof sel !== "object") return false;
  const value = sel as Partial<CellSelectionLike>;
  return (
    typeof value.isRowSelection === "function"
    && typeof value.isColSelection === "function"
    && value.$anchorCell != null
    && value.$headCell != null
  );
}

export function mdLiveFirstTablePos(doc: Node): number | null {
  let found: number | null = null;
  doc.descendants((node, pos) => {
    if (found != null) return false;
    if (node.type.name === "table") {
      found = pos;
      return false;
    }
    return true;
  });
  return found;
}

export function mdLiveTablePosFromSelection(state: EditorState): number | null {
  const sel = state.selection;
  const selected = (sel as { node?: Node }).node;
  if (selected?.type.name === "table") return sel.from;
  const $pos = sel.$anchor;
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === "table") return $pos.before(depth);
  }
  return null;
}

export function isMdLiveFullTableSelection(state: EditorState): boolean {
  const sel = state.selection;
  const selected = (sel as { node?: Node }).node;
  if (selected?.type.name === "table") return true;
  if (!isMdLiveCellSelection(sel)) return false;
  if (sel.isRowSelection() && sel.isColSelection()) return true;
  const tablePos = mdLiveTablePosFromSelection(state);
  if (tablePos == null) return false;
  const table = state.doc.nodeAt(tablePos);
  if (!table || table.type.name !== "table") return false;
  const map = TableMap.get(table);
  const tableStart = tablePos + 1;
  const rect = map.rectBetween(sel.$anchorCell.pos - tableStart, sel.$headCell.pos - tableStart);
  return rect.left === 0 && rect.top === 0 && rect.right === map.width && rect.bottom === map.height;
}

function tableInfo(state: EditorState, tablePos: number): TableInfo | null {
  const table = state.doc.nodeAt(tablePos);
  if (!table || table.type.name !== "table") return null;
  return {
    table,
    tablePos,
    tableStart: tablePos + 1,
    map: TableMap.get(table),
  };
}

function asRect(info: TableInfo): TableRect {
  return {
    map: info.map,
    table: info.table,
    tableStart: info.tableStart,
    left: 0,
    top: 0,
    right: info.map.width,
    bottom: info.map.height,
  };
}

function caretAfterTableDelete(tr: Transaction, from: number, paragraph: Node["type"] | undefined): Transaction {
  if (tr.doc.content.size === 0 && paragraph) {
    tr = tr.insert(0, paragraph.create());
    return tr.setSelection(TextSelection.create(tr.doc, 1));
  }
  const cursor = Math.max(0, Math.min(from, tr.doc.content.size));
  return tr.setSelection(TextSelection.near(tr.doc.resolve(cursor), from > 0 ? -1 : 1));
}

function deleteTableOn(tr: Transaction, tablePos: number, paragraph: Node["type"] | undefined): Transaction | null {
  const table = tr.doc.nodeAt(tablePos);
  if (!table || table.type.name !== "table") return null;
  const from = tablePos;
  const to = tablePos + table.nodeSize;
  return caretAfterTableDelete(tr.delete(from, to), from, paragraph);
}

function deleteTableAt(state: EditorState, tablePos: number): Transaction | null {
  return deleteTableOn(state.tr, tablePos, state.schema.nodes.paragraph);
}

function liveTableRect(tr: Transaction, tablePos: number): TableRect | null {
  const table = tr.doc.nodeAt(tablePos);
  if (!table || table.type.name !== "table") return null;
  const map = TableMap.get(table);
  return {
    table,
    tableStart: tablePos + 1,
    map,
    left: 0,
    top: 0,
    right: map.width,
    bottom: map.height,
  };
}

function selectionCellRect(state: EditorState, info: TableInfo, sel: CellSelectionLike): {
  left: number;
  top: number;
  right: number;
  bottom: number;
} {
  return info.map.rectBetween(
    sel.$anchorCell.pos - info.tableStart,
    sel.$headCell.pos - info.tableStart,
  );
}

function promoteBodyToHeaderOn(tr: Transaction, tablePos: number): Transaction | null {
  const table = tr.doc.nodeAt(tablePos);
  if (!table || table.type.name !== "table") return null;
  const header = table.child(0);
  const body = table.child(1);
  const headerCellType = tr.doc.type.schema.nodes.table_header;
  if (!header || !body || !headerCellType) return null;
  const cells: Node[] = [];
  const count = Math.min(header.childCount, body.childCount);
  for (let i = 0; i < count; i += 1) {
    const from = body.child(i);
    cells.push(headerCellType.create(
      { alignment: from.attrs.alignment ?? header.child(i)?.attrs.alignment ?? "left" },
      from.content,
    ));
  }
  if (cells.length === 0) return deleteTableOn(tr, tablePos, tr.doc.type.schema.nodes.paragraph);
  const from = tablePos + 1;
  const to = from + header.nodeSize + body.nodeSize;
  return tr.replaceWith(from, to, header.type.create(null, cells));
}

function deleteSelectedColumns(
  state: EditorState,
  info: TableInfo,
  left: number,
  right: number,
): Transaction | null {
  if (right - left >= info.map.width || info.map.width - (right - left) < 1) {
    return deleteTableAt(state, info.tablePos);
  }
  const tr = state.tr;
  for (let index = right - 1; index >= left; index -= 1) {
    const rect = liveTableRect(tr, info.tablePos);
    if (!rect) return null;
    removeColumn(tr, rect, index);
  }
  return tr.setSelection(TextSelection.near(tr.doc.resolve(info.tablePos + 2)));
}

function deleteSelectedRows(
  state: EditorState,
  info: TableInfo,
  top: number,
  bottom: number,
): Transaction | null {
  const remaining = info.map.height - (bottom - top);
  if (remaining < 2) return deleteTableAt(state, info.tablePos);
  const tr = state.tr;
  const from = top === 0 ? 1 : top;
  for (let index = bottom - 1; index >= from; index -= 1) {
    const rect = liveTableRect(tr, info.tablePos);
    if (!rect) return null;
    removeRow(tr, rect, index);
  }
  if (top === 0) {
    const next = promoteBodyToHeaderOn(tr, info.tablePos);
    if (!next) return null;
    return next.setSelection(TextSelection.near(next.doc.resolve(info.tablePos + 2)));
  }
  return tr.setSelection(TextSelection.near(tr.doc.resolve(info.tablePos + 2)));
}

export function mdLiveDeleteFullTable(state: EditorState): Transaction | null {
  if (!isMdLiveFullTableSelection(state)) return null;
  const tablePos = mdLiveTablePosFromSelection(state);
  if (tablePos == null) return null;
  return deleteTableAt(state, tablePos);
}

export function mdLiveDeleteTableSelection(state: EditorState): Transaction | null {
  const sel = state.selection;
  const selected = (sel as { node?: Node }).node;
  if (selected?.type.name === "table") return deleteTableAt(state, sel.from);
  if (!isMdLiveCellSelection(sel)) return null;
  const tablePos = mdLiveTablePosFromSelection(state);
  if (tablePos == null) return null;
  const info = tableInfo(state, tablePos);
  if (!info) return null;
  const isRow = sel.isRowSelection();
  const isCol = sel.isColSelection();
  if (isRow && isCol) return deleteTableAt(state, tablePos);
  const rect = selectionCellRect(state, info, sel);
  if (isCol) return deleteSelectedColumns(state, info, rect.left, rect.right);
  if (isRow) return deleteSelectedRows(state, info, rect.top, rect.bottom);
  return null;
}

function insertBodyRow(state: EditorState, info: TableInfo, index: number): Transaction | null {
  const rowType = state.schema.nodes.table_row;
  const cellType = state.schema.nodes.table_cell;
  if (!rowType || !cellType) return null;
  const row = Math.max(1, Math.min(index, info.map.height));
  let rowPos = info.tableStart;
  for (let i = 0; i < row; i += 1) rowPos += info.table.child(i).nodeSize;
  const cells: Node[] = [];
  for (let col = 0; col < info.map.width; col += 1) {
    const headerCell = info.table.nodeAt(info.map.map[col] ?? 0);
    const created = cellType.createAndFill({ alignment: headerCell?.attrs.alignment ?? "left" });
    if (!created) return null;
    cells.push(created);
  }
  return state.tr.insert(rowPos, rowType.create(null, cells));
}

function addRowAboveHeader(state: EditorState, info: TableInfo): Transaction | null {
  const header = info.table.child(0);
  const rowType = state.schema.nodes.table_row;
  const headerCellType = state.schema.nodes.table_header;
  const cellType = state.schema.nodes.table_cell;
  if (!header || !rowType || !headerCellType || !cellType) return null;
  const emptyHeader: Node[] = [];
  const bodyCells: Node[] = [];
  header.forEach((cell) => {
    const alignment = cell.attrs.alignment ?? "left";
    const nextHeader = headerCellType.createAndFill({ alignment });
    if (!nextHeader) return;
    emptyHeader.push(nextHeader);
    bodyCells.push(cellType.create({ alignment }, cell.content));
  });
  if (emptyHeader.length === 0 || emptyHeader.length !== bodyCells.length) return null;
  const from = info.tableStart;
  const to = from + header.nodeSize;
  return state.tr.replaceWith(from, to, [
    header.type.create(null, emptyHeader),
    rowType.create(null, bodyCells),
  ]);
}

function promoteBodyToHeader(state: EditorState, info: TableInfo): Transaction | null {
  return promoteBodyToHeaderOn(state.tr, info.tablePos);
}

export function mdLiveTableAddRow(
  state: EditorState,
  tablePos: number,
  rowIndex: number,
  where: "before" | "after",
): Transaction | null {
  const info = tableInfo(state, tablePos);
  if (!info) return null;
  const insertAt = where === "before" ? rowIndex : rowIndex + 1;
  if (insertAt <= 0) return addRowAboveHeader(state, info);
  return insertBodyRow(state, info, insertAt);
}

export function mdLiveTableAddCol(
  state: EditorState,
  tablePos: number,
  colIndex: number,
  where: "before" | "after",
): Transaction | null {
  const info = tableInfo(state, tablePos);
  if (!info) return null;
  const insertAt = Math.max(0, Math.min(where === "before" ? colIndex : colIndex + 1, info.map.width));
  return addColumn(state.tr, asRect(info), insertAt);
}

export function mdLiveTableDeleteRow(
  state: EditorState,
  tablePos: number,
  rowIndex: number,
): Transaction | null {
  const info = tableInfo(state, tablePos);
  if (!info) return null;
  if (rowIndex < 0 || rowIndex >= info.map.height) return null;
  if (info.map.height <= 2) return deleteTableAt(state, tablePos);
  if (rowIndex === 0) return promoteBodyToHeader(state, info);
  const tr = state.tr;
  removeRow(tr, asRect(info), rowIndex);
  return tr;
}

export function mdLiveTableDeleteCol(
  state: EditorState,
  tablePos: number,
  colIndex: number,
): Transaction | null {
  const info = tableInfo(state, tablePos);
  if (!info) return null;
  if (colIndex < 0 || colIndex >= info.map.width) return null;
  if (info.map.width <= 1) return deleteTableAt(state, tablePos);
  const tr = state.tr;
  removeColumn(tr, asRect(info), colIndex);
  return tr;
}

export const mdLiveTableDeletePlugin = $prose(() => {
  return new Plugin({
    key: new PluginKey("mdLiveTableDelete"),
    props: {
      handleKeyDown(view, event) {
        if (event.key !== "Backspace" && event.key !== "Delete") return false;
        const tr = mdLiveDeleteTableSelection(view.state);
        if (!tr) return false;
        event.preventDefault();
        view.dispatch(tr.scrollIntoView());
        return true;
      },
    },
  });
});
