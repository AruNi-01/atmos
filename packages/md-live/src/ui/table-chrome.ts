import type { MilkdownPlugin } from "@milkdown/kit/ctx";
import type { Node } from "@milkdown/kit/prose/model";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import { tableSchema } from "@milkdown/kit/preset/gfm";
import { $view } from "@milkdown/kit/utils";
import { mdLiveLabel } from "./copy";
import {
  mdLiveFirstTablePos,
  mdLiveTableAddCol,
  mdLiveTableAddRow,
  mdLiveTableAtScrollEnd,
  mdLiveTableDeleteCol,
  mdLiveTableDeleteRow,
} from "./table-ops";
import type { MdLiveCopyFn } from "./types";

const HANDLE = 22;
const ADD = 28;

const DOTS_V =
  '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><circle cx="8" cy="3.5" r="1.35" fill="currentColor"/><circle cx="8" cy="8" r="1.35" fill="currentColor"/><circle cx="8" cy="12.5" r="1.35" fill="currentColor"/></svg>';
const DOTS_H =
  '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><circle cx="3.5" cy="8" r="1.35" fill="currentColor"/><circle cx="8" cy="8" r="1.35" fill="currentColor"/><circle cx="12.5" cy="8" r="1.35" fill="currentColor"/></svg>';
const PLUS =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 3.25v9.5M3.25 8h9.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

type TableOp = (state: EditorState, tablePos: number, index: number) => Transaction | null;

function setShown(el: HTMLElement, shown: boolean): void {
  el.dataset.show = shown ? "true" : "false";
}

function isChromeTarget(target: EventTarget | null, frame: HTMLElement): boolean {
  if (!(target instanceof Element)) return false;
  const chrome = target.closest("[data-md-live-table-chrome]");
  return Boolean(chrome && frame.contains(chrome));
}

function cellIndex(table: HTMLElement, cell: HTMLElement): { row: number; col: number } | null {
  const row = cell.closest("tr");
  if (!(row instanceof HTMLElement) || !table.contains(row)) return null;
  const rows = Array.from(table.querySelectorAll("tr"));
  const rowIndex = rows.indexOf(row);
  const colIndex = Array.from(row.children).indexOf(cell);
  if (rowIndex < 0 || colIndex < 0) return null;
  return { row: rowIndex, col: colIndex };
}

function createButton(className: string, html: string, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.innerHTML = html;
  button.setAttribute("aria-label", label);
  button.tabIndex = -1;
  return button;
}

function createMenu(kind: "row" | "col"): HTMLDivElement {
  const menu = document.createElement("div");
  menu.className = "md-live-table-handle-menu";
  menu.setAttribute("role", "menu");
  const items =
    kind === "row"
      ? [
          ["row-before", "tableAddRowAbove"],
          ["row-after", "tableAddRowBelow"],
          ["row-delete", "tableDeleteRow"],
        ]
      : [
          ["col-before", "tableAddColLeft"],
          ["col-after", "tableAddColRight"],
          ["col-delete", "tableDeleteCol"],
        ];
  for (const [op, key] of items) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "md-live-table-handle-item";
    item.setAttribute("role", "menuitem");
    item.dataset.op = op;
    item.dataset.labelKey = key;
    if (op.endsWith("delete")) item.dataset.variant = "destructive";
    menu.append(item);
  }
  return menu;
}

function paintMenuLabels(root: HTMLElement, getCopy: () => MdLiveCopyFn | undefined): void {
  root.querySelectorAll<HTMLElement>("[data-label-key]").forEach((el) => {
    const key = el.dataset.labelKey;
    if (!key) return;
    el.textContent = mdLiveLabel(key, getCopy());
  });
}

export function mdLiveTableViewPlugin(getCopy: () => MdLiveCopyFn | undefined): MilkdownPlugin {
  return $view(tableSchema.node, () => (node, view, getPos) => {
    const frame = document.createElement("div");
    frame.className = "md-live-table-frame";
    const scroll = document.createElement("div");
    scroll.className = "md-live-table-scroll";
    const table = document.createElement("table");
    table.className = "md-live-table";

    const rowHandle = document.createElement("div");
    rowHandle.className = "md-live-table-handle md-live-table-handle--row";
    rowHandle.dataset.mdLiveTableChrome = "row";
    rowHandle.contentEditable = "false";
    const rowBtn = createButton("md-live-table-handle-btn", DOTS_V, mdLiveLabel("tableRowMenu", getCopy()));
    const rowMenu = createMenu("row");
    rowHandle.append(rowBtn, rowMenu);

    const colHandle = document.createElement("div");
    colHandle.className = "md-live-table-handle md-live-table-handle--col";
    colHandle.dataset.mdLiveTableChrome = "col";
    colHandle.contentEditable = "false";
    const colBtn = createButton("md-live-table-handle-btn", DOTS_H, mdLiveLabel("tableColMenu", getCopy()));
    const colMenu = createMenu("col");
    colHandle.append(colBtn, colMenu);

    const addRow = createButton("md-live-table-add md-live-table-add--row", PLUS, mdLiveLabel("tableAddRow", getCopy()));
    addRow.dataset.mdLiveTableChrome = "add-row";
    addRow.dataset.op = "add-row";
    addRow.contentEditable = "false";

    const addCol = createButton("md-live-table-add md-live-table-add--col", PLUS, mdLiveLabel("tableAddCol", getCopy()));
    addCol.dataset.mdLiveTableChrome = "add-col";
    addCol.dataset.op = "add-col";
    addCol.contentEditable = "false";

    scroll.append(table);
    frame.append(rowHandle, colHandle, addRow, addCol, scroll);
    setShown(rowHandle, false);
    setShown(colHandle, false);
    setShown(addRow, false);
    setShown(addCol, false);
    paintMenuLabels(frame, getCopy);

    let hoverRow = -1;
    let hoverCol = -1;
    let hideTimer = 0;
    let raf = 0;

    const cancelHide = () => {
      window.clearTimeout(hideTimer);
      hideTimer = 0;
    };

    const hideChrome = () => {
      hoverRow = -1;
      hoverCol = -1;
      setShown(rowHandle, false);
      setShown(colHandle, false);
      setShown(addRow, false);
      setShown(addCol, false);
      frame.classList.remove("is-adding-row", "is-adding-col");
    };

    const scheduleHide = () => {
      cancelHide();
      hideTimer = window.setTimeout(hideChrome, 140);
    };

    const positionChrome = () => {
      if (hoverRow < 0 || hoverCol < 0) return;
      const rows = Array.from(table.querySelectorAll("tr"));
      const row = rows[hoverRow];
      const cell = row?.children[hoverCol];
      if (!(row instanceof HTMLElement) || !(cell instanceof HTMLElement)) return;
      const frameBox = frame.getBoundingClientRect();
      const tableBox = scroll.getBoundingClientRect();
      const rowBox = row.getBoundingClientRect();
      const cellBox = cell.getBoundingClientRect();
      rowHandle.style.top = `${rowBox.top - frameBox.top + rowBox.height / 2 - HANDLE / 2}px`;
      rowHandle.style.left = `${tableBox.left - frameBox.left - HANDLE / 2}px`;
      colHandle.style.left = `${cellBox.left - frameBox.left + cellBox.width / 2 - HANDLE / 2}px`;
      colHandle.style.top = `${tableBox.top - frameBox.top - HANDLE / 2}px`;
      addRow.style.left = `${tableBox.left - frameBox.left}px`;
      addRow.style.width = `${tableBox.width}px`;
      addRow.style.top = `${tableBox.bottom - frameBox.top}px`;
      addRow.style.height = `${ADD}px`;
      addCol.style.top = `${tableBox.top - frameBox.top}px`;
      addCol.style.height = `${tableBox.height}px`;
      addCol.style.left = `${tableBox.right - frameBox.left}px`;
      addCol.style.width = `${ADD}px`;
      const lastRow = hoverRow === rows.length - 1;
      const lastCol = hoverCol === (row.childElementCount - 1);
      const lastColInView = lastCol && mdLiveTableAtScrollEnd(
        scroll.scrollLeft,
        scroll.clientWidth,
        scroll.scrollWidth,
      );
      setShown(rowHandle, true);
      setShown(colHandle, true);
      setShown(addRow, lastRow);
      setShown(addCol, lastColInView);
      frame.classList.toggle("is-adding-row", lastRow);
      frame.classList.toggle("is-adding-col", lastColInView);
    };

    const showAt = (row: number, col: number) => {
      if (!view.editable) return;
      cancelHide();
      hoverRow = row;
      hoverCol = col;
      rowBtn.setAttribute("aria-label", mdLiveLabel("tableRowMenu", getCopy()));
      colBtn.setAttribute("aria-label", mdLiveLabel("tableColMenu", getCopy()));
      addRow.setAttribute("aria-label", mdLiveLabel("tableAddRow", getCopy()));
      addCol.setAttribute("aria-label", mdLiveLabel("tableAddCol", getCopy()));
      paintMenuLabels(frame, getCopy);
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(positionChrome);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!view.editable) return;
      const target = event.target;
      if (isChromeTarget(target, frame)) {
        cancelHide();
        if (hoverRow >= 0) {
          const add = target instanceof Element ? target.closest("[data-md-live-table-chrome]") : null;
          if (add?.getAttribute("data-md-live-table-chrome") === "add-row") {
            const rows = table.querySelectorAll("tr");
            hoverRow = Math.max(0, rows.length - 1);
          } else if (add?.getAttribute("data-md-live-table-chrome") === "add-col") {
            const row = table.querySelector("tr");
            hoverCol = Math.max(0, (row?.childElementCount ?? 1) - 1);
          }
          positionChrome();
        }
        return;
      }
      const cell = target instanceof Element ? target.closest("th, td") : null;
      if (!(cell instanceof HTMLElement) || !table.contains(cell)) {
        scheduleHide();
        return;
      }
      const index = cellIndex(table, cell);
      if (!index) {
        scheduleHide();
        return;
      }
      showAt(index.row, index.col);
    };

    const dispatchOp = (op: string) => {
      if (!view.editable) return;
      const pos = (typeof getPos === "function" ? getPos() : undefined) ?? mdLiveFirstTablePos(view.state.doc);
      if (pos == null) return;
      const indexFor = (axis: "row" | "col") => (axis === "row" ? hoverRow : hoverCol);
      const run = (fn: TableOp, index: number) => {
        if (index < 0) return;
        const tr = fn(view.state, pos, index);
        if (!tr) return;
        view.dispatch(tr.scrollIntoView());
        view.focus();
      };
      const lastRow = Math.max(0, table.querySelectorAll("tr").length - 1);
      const lastCol = Math.max(0, (table.querySelector("tr")?.childElementCount ?? 1) - 1);
      switch (op) {
        case "row-before":
          run((state, tablePos, index) => mdLiveTableAddRow(state, tablePos, index, "before"), indexFor("row"));
          break;
        case "row-after":
          run((state, tablePos, index) => mdLiveTableAddRow(state, tablePos, index, "after"), indexFor("row"));
          break;
        case "row-delete":
          run(mdLiveTableDeleteRow, indexFor("row"));
          break;
        case "col-before":
          run((state, tablePos, index) => mdLiveTableAddCol(state, tablePos, index, "before"), indexFor("col"));
          break;
        case "col-after":
          run((state, tablePos, index) => mdLiveTableAddCol(state, tablePos, index, "after"), indexFor("col"));
          break;
        case "col-delete":
          run(mdLiveTableDeleteCol, indexFor("col"));
          break;
        case "add-row":
          run((state, tablePos, index) => mdLiveTableAddRow(state, tablePos, index, "after"), lastRow);
          break;
        case "add-col":
          run((state, tablePos, index) => mdLiveTableAddCol(state, tablePos, index, "after"), lastCol);
          break;
      }
    };

    const onPointerDown = (event: Event) => {
      if (!isChromeTarget(event.target, frame)) return;
      event.preventDefault();
      event.stopPropagation();
    };

    const onClick = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      const button = event.currentTarget instanceof Element
        ? event.currentTarget
        : event.target instanceof Element
          ? event.target.closest("button[data-op]")
          : null;
      const op = button instanceof HTMLElement ? button.dataset.op : undefined;
      if (op) dispatchOp(op);
    };

    addRow.addEventListener("click", onClick);
    addCol.addEventListener("click", onClick);
    rowMenu.querySelectorAll<HTMLButtonElement>("button[data-op]").forEach((button) => {
      button.addEventListener("click", onClick);
    });
    colMenu.querySelectorAll<HTMLButtonElement>("button[data-op]").forEach((button) => {
      button.addEventListener("click", onClick);
    });

    const onScroll = () => {
      if (hoverRow < 0) return;
      positionChrome();
    };

    const onWheel = (event: WheelEvent) => {
      const overflow = scroll.scrollWidth - scroll.clientWidth;
      if (overflow <= 1) return;
      const delta = event.deltaX !== 0 ? event.deltaX : event.deltaY;
      if (delta === 0) return;
      const next = Math.max(0, Math.min(overflow, scroll.scrollLeft + delta));
      if (next === scroll.scrollLeft) return;
      event.preventDefault();
      scroll.scrollLeft = next;
    };

    frame.addEventListener("pointermove", onPointerMove);
    frame.addEventListener("pointerenter", cancelHide);
    frame.addEventListener("pointerleave", scheduleHide);
    frame.addEventListener("pointerdown", onPointerDown);
    frame.addEventListener("mousedown", onPointerDown);
    scroll.addEventListener("scroll", onScroll, { passive: true });
    scroll.addEventListener("wheel", onWheel, { passive: false });

    void node;

    return {
      dom: frame,
      contentDOM: table,
      update: (updated: Node) => updated.type.name === "table",
      destroy: () => {
        cancelHide();
        window.cancelAnimationFrame(raf);
        frame.removeEventListener("pointermove", onPointerMove);
        frame.removeEventListener("pointerenter", cancelHide);
        frame.removeEventListener("pointerleave", scheduleHide);
        frame.removeEventListener("pointerdown", onPointerDown);
        frame.removeEventListener("mousedown", onPointerDown);
        addRow.removeEventListener("click", onClick);
        addCol.removeEventListener("click", onClick);
        scroll.removeEventListener("scroll", onScroll);
        scroll.removeEventListener("wheel", onWheel);
      },
      ignoreMutation: (mutation: { type: string; target: globalThis.Node }) =>
        mutation.type === "selection" ? false : !table.contains(mutation.target),
      stopEvent: (event: Event) => isChromeTarget(event.target, frame),
    };
  });
}
