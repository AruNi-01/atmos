"use client";

import React from "react";
import { CircleDot, GitPullRequestArrow } from "lucide-react";
import { cn } from "@workspace/ui";

export interface MentionRef {
  kind: "issue" | "pr";
  number: number;
}

export interface ComposerHandle {
  getText: () => string;
  setText: (text: string) => void;
  clear: () => void;
  insertMention: (mention: MentionRef) => void;
  insertImagePlaceholder: (n: number) => void;
  focus: () => void;
}

export interface ComposerCallbacks {
  onTextChange?: (text: string) => void;
  onImagePaste?: (blob: Blob, ext: string) => void;
  onAtTrigger?: (caretRect: DOMRect) => void;
  onAtCancel?: () => void;
}

interface PromptComposerProps extends ComposerCallbacks {
  className?: string;
  placeholder?: React.ReactNode;
  onSubmit?: () => void;
}

const TOKEN_REGEX = /(@(?:issue|pr)#\d+|\[#img-\d+\])/g;

function buildChipNode(token: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.setAttribute("data-token", token);
  span.setAttribute("contenteditable", "false");
  span.className =
    "inline-flex select-none items-center gap-1 rounded-md border border-border/70 bg-muted/60 px-1.5 py-0.5 text-[12px] font-medium text-foreground align-middle mx-[1px]";

  if (token.startsWith("@issue#")) {
    span.dataset.kind = "issue";
    const n = token.split("#")[1];
    span.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg><span>#${n}</span>`;
  } else if (token.startsWith("@pr#")) {
    span.dataset.kind = "pr";
    const n = token.split("#")[1];
    span.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5h2a3 3 0 0 1 3 3v9"/><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M14 9l3-3 3 3"/></svg><span>#${n}</span>`;
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

export const PromptComposer = React.forwardRef<ComposerHandle, PromptComposerProps>(
  function PromptComposer(props, ref) {
    const { onTextChange, onImagePaste, onAtTrigger, onAtCancel, className, placeholder, onSubmit } = props;
    const editorRef = React.useRef<HTMLDivElement | null>(null);
    const [isEmpty, setIsEmpty] = React.useState(true);

    const fireChange = React.useCallback(() => {
      if (!editorRef.current) return;
      const text = serialize(editorRef.current);
      setIsEmpty(text.length === 0);
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
        const token = `@${mention.kind}#${mention.number}`;
        insertNodeAtCaret(editorRef.current, buildChipNode(token));
        insertNodeAtCaret(editorRef.current, document.createTextNode("\u00A0"));
        fireChange();
      },
      insertImagePlaceholder: (n) => {
        if (!editorRef.current) return;
        editorRef.current.focus();
        const token = `[#img-${n}]`;
        insertNodeAtCaret(editorRef.current, buildChipNode(token));
        insertNodeAtCaret(editorRef.current, document.createTextNode("\u00A0"));
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
        // a temporary marker span (collapsed ranges return 0/0 in some browsers).
        requestAnimationFrame(() => {
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0 || !editorRef.current) return;
          const range = sel.getRangeAt(0);
          if (!editorRef.current.contains(range.startContainer)) return;
          const marker = document.createElement("span");
          marker.textContent = "\u200B";
          range.insertNode(marker);
          const rect = marker.getBoundingClientRect();
          // Restore caret to after the @ (where it was), then remove marker.
          const parent = marker.parentNode;
          if (parent) {
            const newRange = document.createRange();
            newRange.setStartAfter(marker);
            newRange.collapse(true);
            parent.removeChild(marker);
            sel.removeAllRanges();
            sel.addRange(newRange);
          }
          onAtTrigger?.(rect);
        });
        return;
      }
      if (event.key === "Escape") {
        onAtCancel?.();
      }
    };

    const handleInput = () => {
      fireChange();
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
          className="min-h-[88px] max-h-[148px] w-full overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-transparent bg-transparent py-2 pl-0 pr-2 text-base leading-6 text-foreground outline-none transition-colors"
          spellCheck={false}
        />
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
