"use client";

import React from "react";
import { createPortal } from "react-dom";
import { cn, getFileIconProps } from "@workspace/ui";

export type MentionRef =
  | { kind: "issue" | "pr"; number: number }
  | { kind: "file"; relativePath: string };

export interface AtTriggerContext {
  caretRect: DOMRect;
  query: string;
  atOffset: number;
}

export interface ComposerHandle {
  getText: () => string;
  setText: (text: string) => void;
  clear: () => void;
  insertMention: (mention: MentionRef) => void;
  insertFileMention: (relativePath: string) => void;
  /**
   * Replace the `@<query>` slice (computed via popover at-context) with the
   * mention chip + a trailing space, then place the caret right after the space
   * so the user can keep typing.
   */
  applyMentionAtRange: (atOffset: number, queryLength: number, mention: MentionRef) => void;
  insertImagePlaceholder: (n: number) => void;
  removeImagePlaceholder: (n: number) => void;
  focus: () => void;
}

export interface ComposerCallbacks {
  onTextChange?: (text: string) => void;
  onImagePaste?: (blob: Blob, ext: string) => void;
  onAtTrigger?: (ctx: AtTriggerContext) => void;
  onAtCancel?: () => void;
}

interface PromptComposerProps extends ComposerCallbacks {
  className?: string;
  placeholder?: React.ReactNode;
  onSubmit?: () => void;
}

const TOKEN_REGEX = /(@(?:issue|pr)#\d+|@file:[^\s]+|\[#img-\d+\])/g;

/**
 * SVG icons used inside chips live as static assets under
 * `apps/web/public/icons/`. They are rendered via CSS mask so they inherit
 * `currentColor` for theme support (`<img src>` would lose the stroke color).
 */
function buildMaskIcon(url: string): HTMLSpanElement {
  const icon = document.createElement("span");
  icon.setAttribute("aria-hidden", "true");
  icon.style.cssText = [
    "display:inline-block",
    "width:12px",
    "height:12px",
    "background-color:currentColor",
    `mask-image:url('${url}')`,
    `-webkit-mask-image:url('${url}')`,
    "mask-size:contain",
    "-webkit-mask-size:contain",
    "mask-repeat:no-repeat",
    "-webkit-mask-repeat:no-repeat",
    "mask-position:center",
    "-webkit-mask-position:center",
  ].join(";");
  return icon;
}

function buildChipNode(token: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.setAttribute("data-token", token);
  span.setAttribute("contenteditable", "false");
  // Vertically tight: no padding, line-height matches the editor's caret so the
  // chip sits flush with the surrounding text without the bordered box towering
  // above/below the caret line.
  span.className =
    "inline-flex select-none items-center gap-1 rounded-md border border-border/70 bg-muted/60 px-1.5 py-px text-[12px] leading-[18px] font-medium text-foreground align-middle mx-[1px]";

  if (token.startsWith("@issue#")) {
    span.dataset.kind = "issue";
    const n = token.split("#")[1];
    span.dataset.tooltip = `Issue #${n}`;
    span.appendChild(buildMaskIcon("/icons/circle-dot.svg"));
    const label = document.createElement("span");
    label.textContent = `#${n}`;
    span.appendChild(label);
  } else if (token.startsWith("@pr#")) {
    span.dataset.kind = "pr";
    const n = token.split("#")[1];
    span.dataset.tooltip = `PR #${n}`;
    span.appendChild(buildMaskIcon("/icons/git-pull-request-arrow.svg"));
    const label = document.createElement("span");
    label.textContent = `#${n}`;
    span.appendChild(label);
  } else if (token.startsWith("@file:")) {
    const relativePath = token.slice("@file:".length);
    const filename = relativePath.split("/").pop() || relativePath;
    const isDir = relativePath.endsWith("/");
    span.dataset.tooltip = relativePath;
    const iconProps = getFileIconProps({ name: filename, isDir, className: "size-3.5" });
    const icon = document.createElement("img");
    icon.src = iconProps.src;
    icon.alt = iconProps.alt ?? "";
    if (iconProps.className) icon.className = iconProps.className;
    span.appendChild(icon);
    const label = document.createElement("span");
    label.textContent = filename;
    span.appendChild(label);
  } else if (token.startsWith("[#img-")) {
    span.dataset.kind = "img";
    span.textContent = token.replace(/[\[\]]/g, "");
  }
  return span;
}

function serialize(root: HTMLElement): string {
  let out = "";
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tok = el.getAttribute("data-token");
      if (tok) {
        out += tok;
        return;
      }
      if (el.tagName === "BR") {
        out += "\n";
        return;
      }
      if (el.tagName === "DIV" || el.tagName === "P") {
        if (out.length > 0 && !out.endsWith("\n")) out += "\n";
        el.childNodes.forEach(walk);
        return;
      }
      el.childNodes.forEach(walk);
    }
  };
  root.childNodes.forEach(walk);
  return out;
}

function inflateInto(root: HTMLElement, text: string) {
  root.innerHTML = "";
  const lines = text.split("\n");
  lines.forEach((line, idx) => {
    if (idx > 0) {
      root.appendChild(document.createElement("br"));
    }
    let last = 0;
    line.replace(TOKEN_REGEX, (match, _g, offset) => {
      if (offset > last) {
        root.appendChild(document.createTextNode(line.slice(last, offset)));
      }
      root.appendChild(buildChipNode(match));
      last = offset + match.length;
      return match;
    });
    if (last < line.length) {
      root.appendChild(document.createTextNode(line.slice(last)));
    }
  });
}

/**
 * Place the selection caret at the given text offset measured by the same
 * counting rules as `serialize`: text nodes count their characters, chip
 * elements count their data-token length, BR counts as 1 newline.
 */
function setCaretAtTextOffset(root: HTMLElement, target: number) {
  let remaining = target;
  let placed = false;

  const placeAtTextNode = (node: Text, offset: number) => {
    const range = document.createRange();
    range.setStart(node, Math.min(offset, node.length));
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    placed = true;
  };

  const placeAfter = (node: Node) => {
    const range = document.createRange();
    range.setStartAfter(node);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    placed = true;
  };

  const walk = (node: Node) => {
    if (placed) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node as Text;
      const len = text.length;
      if (remaining <= len) {
        placeAtTextNode(text, remaining);
        return;
      }
      remaining -= len;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tok = el.getAttribute("data-token");
    if (tok) {
      if (remaining <= tok.length) {
        placeAfter(el);
        return;
      }
      remaining -= tok.length;
      return;
    }
    if (el.tagName === "BR") {
      if (remaining === 0) {
        const range = document.createRange();
        range.setStartBefore(el);
        range.collapse(true);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        placed = true;
        return;
      }
      remaining -= 1;
      return;
    }
    el.childNodes.forEach(walk);
  };

  root.childNodes.forEach(walk);

  if (!placed) {
    const range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }
}

function measureCaretRect(root: HTMLElement): DOMRect {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return root.getBoundingClientRect();
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) return root.getBoundingClientRect();

  const marker = document.createElement("span");
  marker.style.cssText = "display:inline-block;width:0;height:1em;vertical-align:baseline;";
  const cloned = range.cloneRange();
  cloned.insertNode(marker);
  const rect = marker.getBoundingClientRect();
  const parent = marker.parentNode;
  const resetRange = document.createRange();
  resetRange.setStartAfter(marker);
  resetRange.collapse(true);
  if (parent) parent.removeChild(marker);
  sel.removeAllRanges();
  sel.addRange(resetRange);

  if (rect.width === 0 && rect.height === 0) {
    return root.getBoundingClientRect();
  }
  return rect;
}


function readAtContextFromSelection(root: HTMLElement): AtTriggerContext | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;

  // Use DOM toString() to reliably detect the @ trigger and extract the query.
  const beforeRange = range.cloneRange();
  beforeRange.selectNodeContents(root);
  beforeRange.setEnd(range.endContainer, range.endOffset);
  const beforeDomText = beforeRange.toString();
  const domAtIndex = beforeDomText.lastIndexOf("@");
  if (domAtIndex < 0) return null;

  const query = beforeDomText.slice(domAtIndex + 1);
  if (/\s/.test(query)) return null;

  // Find the atOffset in serialize() space so applyMentionAtRange slices correctly.
  // We look for the last "@" in the serialized text that is followed by the same query.
  const fullText = serialize(root);
  const searchStr = "@" + query;
  const serializeAtIndex = fullText.lastIndexOf(searchStr);
  if (serializeAtIndex < 0) return null;

  const rect = measureCaretRect(root);
  return { caretRect: rect, query, atOffset: serializeAtIndex + 1 };
}

export const PromptComposer = React.forwardRef<ComposerHandle, PromptComposerProps>(
  function PromptComposer(props, ref) {
    const { onTextChange, onImagePaste, onAtTrigger, onAtCancel, className, placeholder, onSubmit } = props;
    const editorRef = React.useRef<HTMLDivElement | null>(null);
    const [isEmpty, setIsEmpty] = React.useState(true);
    const [chipTooltip, setChipTooltip] = React.useState<{
      text: string;
      top: number;
      left: number;
    } | null>(null);

    const fireChange = React.useCallback(() => {
      if (!editorRef.current) return;
      const text = serialize(editorRef.current);
      // After Backspace-clearing, browsers commonly leave residual `<br>` /
      // `<div><br></div>` nodes. `serialize` counts these as "\n", so a
      // visually empty editor would otherwise report length > 0 and hide the
      // placeholder. Treat as empty when no chip tokens exist and the text is
      // pure whitespace.
      const hasChip = !!editorRef.current.querySelector("[data-token]");
      setIsEmpty(!hasChip && text.replace(/[\s\u00A0]/g, "").length === 0);
      onTextChange?.(text);
    }, [onTextChange]);

    React.useImperativeHandle(ref, () => ({
      getText: () => (editorRef.current ? serialize(editorRef.current) : ""),
      setText: (text: string) => {
        if (!editorRef.current) return;
        inflateInto(editorRef.current, text);
        fireChange();
      },
      clear: () => {
        if (!editorRef.current) return;
        editorRef.current.innerHTML = "";
        fireChange();
      },
      insertMention: (mention) => {
        if (!editorRef.current) return;
        editorRef.current.focus();
        if (mention.kind === "file") {
          const token = `@file:${mention.relativePath}`;
          insertNodeAtCaret(editorRef.current, buildChipNode(token));
          insertNodeAtCaret(editorRef.current, document.createTextNode("\u00A0"));
          fireChange();
          return;
        }
        const token = `@${mention.kind}#${mention.number}`;
        insertNodeAtCaret(editorRef.current, buildChipNode(token));
        insertNodeAtCaret(editorRef.current, document.createTextNode("\u00A0"));
        fireChange();
      },
      insertFileMention: (relativePath: string) => {
        if (!editorRef.current) return;
        editorRef.current.focus();
        const token = `@file:${relativePath}`;
        insertNodeAtCaret(editorRef.current, buildChipNode(token));
        insertNodeAtCaret(editorRef.current, document.createTextNode("\u00A0"));
        fireChange();
      },
      applyMentionAtRange: (atOffset, queryLength, mention) => {
        if (!editorRef.current) return;
        editorRef.current.focus();
        const token =
          mention.kind === "file"
            ? `@file:${mention.relativePath}`
            : `@${mention.kind}#${mention.number}`;
        const currentText = serialize(editorRef.current);
        const replaceFrom = Math.max(atOffset - 1, 0);
        const replaceTo = Math.min(atOffset + queryLength, currentText.length);
        const insertText = `${token} `;
        const nextText =
          currentText.slice(0, replaceFrom) +
          insertText +
          currentText.slice(replaceTo);
        inflateInto(editorRef.current, nextText);
        fireChange();
        setCaretAtTextOffset(editorRef.current, replaceFrom + insertText.length);
      },
      insertImagePlaceholder: (n) => {
        if (!editorRef.current) return;
        editorRef.current.focus();
        const token = `[#img-${n}]`;
        insertNodeAtCaret(editorRef.current, buildChipNode(token));
        insertNodeAtCaret(editorRef.current, document.createTextNode("\u00A0"));
        fireChange();
      },
      removeImagePlaceholder: (n) => {
        if (!editorRef.current) return;
        const token = `[#img-${n}]`;
        const nodes = editorRef.current.querySelectorAll(`[data-token="${CSS.escape(token)}"]`);
        nodes.forEach((node) => node.remove());
        fireChange();
      },
      focus: () => editorRef.current?.focus(),
    }));

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" && !event.shiftKey && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onSubmit?.();
        return;
      }
      if (event.key === "@") {
        // After the browser inserts "@", measure the caret position by inserting
        // a temporary inline-block marker so it always has a layout box.
        requestAnimationFrame(() => {
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0 || !editorRef.current) return;
          const range = sel.getRangeAt(0);
          if (!editorRef.current.contains(range.startContainer)) return;
          const measuredRect = measureCaretRect(editorRef.current);
          const atCtx = readAtContextFromSelection(editorRef.current);
          if (atCtx) {
            onAtTrigger?.({ ...atCtx, caretRect: measuredRect });
          } else {
            onAtCancel?.();
          }
        });
        return;
      }
      if (event.key === "Escape") {
        onAtCancel?.();
      }
    };

    const handleInput = () => {
      fireChange();
      if (!editorRef.current) return;
      // The hovered chip may have been deleted by this input (e.g. Backspace);
      // a removed DOM node never fires mouseout, so the tooltip would stay
      // stuck. Drop it here — if the cursor is still on a surviving chip the
      // next mouseover will re-show it.
      setChipTooltip(null);
      const atCtx = readAtContextFromSelection(editorRef.current);
      if (atCtx) {
        onAtTrigger?.(atCtx);
      } else {
        onAtCancel?.();
      }
    };

    const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
      const items = event.clipboardData.items;
      let imageHandled = false;
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (blob) {
            event.preventDefault();
            imageHandled = true;
            const ext = item.type.split("/")[1] || "png";
            onImagePaste?.(blob, ext);
          }
        }
      }
      if (imageHandled) return;
      // Plain text paste — strip rich formatting
      event.preventDefault();
      const text = event.clipboardData.getData("text/plain");
      if (text) {
        document.execCommand("insertText", false, text);
      }
    };

    const handleEditorMouseOver = (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      const chip = target?.closest?.("[data-tooltip]") as HTMLElement | null;
      if (!chip || !editorRef.current?.contains(chip)) return;
      const text = chip.dataset.tooltip;
      if (!text) return;
      const rect = chip.getBoundingClientRect();
      setChipTooltip({
        text,
        top: rect.bottom + 6,
        left: rect.left + rect.width / 2,
      });
    };

    const handleEditorMouseOut = (event: React.MouseEvent<HTMLDivElement>) => {
      const related = event.relatedTarget as Node | null;
      const target = event.target as HTMLElement | null;
      const chip = target?.closest?.("[data-tooltip]") as HTMLElement | null;
      if (!chip) return;
      // Still inside the same chip — keep the tooltip.
      if (related && chip.contains(related)) return;
      setChipTooltip(null);
    };

    return (
      <div className={cn("relative", className)}>
        {isEmpty && placeholder ? (
          <div className="pointer-events-none absolute inset-y-auto right-2 top-2 left-0 overflow-hidden text-base leading-6 text-muted-foreground/65">
            {placeholder}
          </div>
        ) : null}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onMouseOver={handleEditorMouseOver}
          onMouseOut={handleEditorMouseOut}
          className="min-h-[88px] max-h-[148px] w-full overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-transparent bg-transparent py-2 pl-0 pr-2 text-base leading-6 text-foreground outline-none transition-colors"
          spellCheck={false}
        />
        {chipTooltip && typeof document !== "undefined"
          ? createPortal(
              <div
                role="tooltip"
                className="pointer-events-none fixed z-[2147483646] -translate-x-1/2 rounded-md bg-foreground px-3 py-1.5 text-xs text-background shadow-md animate-in fade-in-0 zoom-in-95"
                style={{ top: chipTooltip.top, left: chipTooltip.left }}
              >
                {chipTooltip.text}
              </div>,
              document.body,
            )
          : null}
      </div>
    );
  },
);

function insertNodeAtCaret(root: HTMLElement, node: Node) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) {
    root.appendChild(node);
    return;
  }
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) {
    root.appendChild(node);
    return;
  }
  range.deleteContents();
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}
