"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useHotkeys } from "react-hotkeys-hook";
import { useTranslations } from "next-intl";
import {
  CaseSensitive,
  ChevronLeft,
  ChevronRight,
  Regex,
  WholeWord,
  X,
} from "lucide-react";
import { cn } from "@workspace/ui";
import {
  findMarkdownHits,
  markdownFindCounter,
  scrollMarkdownFindHitIntoView,
  type MarkdownFindHit,
  type MarkdownFindQuery,
} from "@/features/editor/lib/markdown-find";

type HighlightBox = {
  top: number;
  left: number;
  width: number;
  height: number;
  current: boolean;
};

function selectedSearchSeed(): string {
  const text = window.getSelection()?.toString() ?? "";
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.length > 200) return "";
  return trimmed;
}

function hitBoxes(root: HTMLElement, hits: MarkdownFindHit[], currentIndex: number): HighlightBox[] {
  const rootRect = root.getBoundingClientRect();
  const boxes: HighlightBox[] = [];
  hits.forEach((hit, index) => {
    const range = root.ownerDocument.createRange();
    try {
      range.setStart(hit.startNode, hit.startOffset);
      range.setEnd(hit.endNode, hit.endOffset);
    } catch {
      return;
    }
    for (const rect of Array.from(range.getClientRects())) {
      if (rect.width < 1 || rect.height < 1) continue;
      boxes.push({
        top: rect.top - rootRect.top + root.scrollTop,
        left: rect.left - rootRect.left + root.scrollLeft,
        width: rect.width,
        height: rect.height,
        current: index === currentIndex,
      });
    }
  });
  return boxes;
}

function FindToggle({
  pressed,
  label,
  onPressedChange,
  children,
}: {
  pressed: boolean;
  label: string;
  onPressedChange: (next: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-md text-muted-foreground",
        pressed
          ? "bg-foreground/10 text-foreground"
          : "hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function MarkdownFindPanel({
  open,
  root,
  focusNonce,
  onClose,
}: {
  open: boolean;
  root: HTMLElement | null;
  focusNonce: number;
  onClose: () => void;
}) {
  const t = useTranslations("Editor.components");
  const inputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [regexp, setRegexp] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [boxes, setBoxes] = useState<HighlightBox[]>([]);
  const [hitCount, setHitCount] = useState(0);
  const [invalid, setInvalid] = useState(false);
  const hitsRef = useRef<MarkdownFindHit[]>([]);

  const query = useMemo<MarkdownFindQuery>(
    () => ({ search, caseSensitive, wholeWord, regexp }),
    [search, caseSensitive, wholeWord, regexp],
  );

  const refresh = useCallback(
    (nextIndex?: number) => {
      if (!open || !root) {
        hitsRef.current = [];
        setBoxes([]);
        setHitCount(0);
        setInvalid(false);
        return;
      }
      const { hits, invalid: nextInvalid } = findMarkdownHits(root, query);
      hitsRef.current = hits;
      const index =
        hits.length === 0
          ? 0
          : Math.min(nextIndex ?? activeIndex, hits.length - 1);
      setActiveIndex(index);
      setHitCount(hits.length);
      setInvalid(nextInvalid);
      setBoxes(hitBoxes(root, hits, index));
      const current = hits[index];
      if (current) scrollMarkdownFindHitIntoView(root, current);
    },
    [activeIndex, open, query, root],
  );

  useEffect(() => {
    if (!open) return;
    const seed = selectedSearchSeed();
    if (seed) setSearch(seed);
    // Seed only when the panel opens, not when Cmd+F refocuses an open panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useLayoutEffect(() => {
    refresh(0);
    // Query changes should restart at the first hit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, root]);

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(id);
  }, [focusNonce, open]);

  useEffect(() => {
    if (!open || !root) return;
    const onScrollOrResize = () => {
      setBoxes(hitBoxes(root, hitsRef.current, activeIndex));
    };
    root.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);
    const observer = new MutationObserver((mutations) => {
      const relevant = mutations.some((mutation) => {
        const node =
          mutation.target instanceof Element
            ? mutation.target
            : mutation.target.parentElement;
        return !node?.closest(
          "[data-markdown-find-highlight], [data-markdown-find-panel]",
        );
      });
      if (!relevant) return;
      const { hits, invalid: nextInvalid } = findMarkdownHits(root, query);
      hitsRef.current = hits;
      const index = hits.length === 0 ? 0 : Math.min(activeIndex, hits.length - 1);
      setActiveIndex(index);
      setHitCount(hits.length);
      setInvalid(nextInvalid);
      setBoxes(hitBoxes(root, hits, index));
    });
    observer.observe(root, { subtree: true, childList: true, characterData: true });
    return () => {
      root.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
      observer.disconnect();
    };
  }, [activeIndex, open, query, root]);

  const goTo = useCallback(
    (direction: 1 | -1) => {
      const hits = hitsRef.current;
      if (!root || hits.length === 0) return;
      const next =
        (activeIndex + direction + hits.length) % hits.length;
      setActiveIndex(next);
      setBoxes(hitBoxes(root, hits, next));
      const current = hits[next];
      if (current) scrollMarkdownFindHitIntoView(root, current);
    },
    [activeIndex, root],
  );

  useHotkeys(
    "escape",
    () => onClose(),
    {
      enabled: open,
      enableOnContentEditable: true,
      enableOnFormTags: true,
      preventDefault: true,
    },
    [onClose, open],
  );
  useHotkeys(
    "f3, mod+g",
    () => goTo(1),
    {
      enabled: open,
      enableOnContentEditable: true,
      enableOnFormTags: true,
      preventDefault: true,
    },
    [goTo, open],
  );
  useHotkeys(
    "shift+f3, shift+mod+g",
    () => goTo(-1),
    {
      enabled: open,
      enableOnContentEditable: true,
      enableOnFormTags: true,
      preventDefault: true,
    },
    [goTo, open],
  );

  if (!open) return null;

  const counter = markdownFindCounter(
    hitCount === 0 || !search ? -1 : activeIndex,
    search ? hitCount : 0,
  );

  return (
    <>
      {root && boxes.length > 0
        ? createPortal(
            <div
              data-markdown-find-highlight=""
              className="pointer-events-none absolute z-[1] overflow-visible"
              style={{ left: 0, top: 0, width: 1, height: 1 }}
            >
              {boxes.map((box, index) => (
                <span
                  key={`${box.top}-${box.left}-${index}`}
                  className={
                    box.current
                      ? "absolute rounded-sm bg-[#fde047aa] dark:bg-[#ca8a0444]"
                      : "absolute rounded-sm bg-[#fef08a99] dark:bg-[#854d0e55]"
                  }
                  style={{
                    top: box.top,
                    left: box.left,
                    width: box.width,
                    height: box.height,
                  }}
                />
              ))}
            </div>,
            root,
          )
        : null}
      <div
        data-markdown-find-panel=""
        className="pointer-events-auto absolute top-2 right-2 z-30 w-[min(26rem,calc(100%-1rem))] rounded-lg border border-border/80 bg-background/80 p-3 shadow-lg backdrop-blur-md"
      >
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">
              {t("searchPanel.find")}
            </span>
            {counter ? (
              <span
                data-markdown-find-count={counter}
                className="text-xs text-muted-foreground"
              >
                {counter}
              </span>
            ) : null}
            <button
              type="button"
              className="inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              title={t("searchPanel.previousMatch")}
              aria-label={t("searchPanel.previousMatch")}
              onClick={() => goTo(-1)}
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <button
              type="button"
              className="inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              title={t("searchPanel.nextMatch")}
              aria-label={t("searchPanel.nextMatch")}
              onClick={() => goTo(1)}
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>
          <button
            type="button"
            className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            title={t("searchPanel.closeSearch")}
            aria-label={t("searchPanel.closeSearch")}
            onClick={onClose}
          >
            <X className="size-3.5" />
          </button>
        </div>
        <div className="relative">
          <input
            ref={inputRef}
            data-markdown-find-input=""
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              goTo(event.shiftKey ? -1 : 1);
            }}
            placeholder={t("searchPanel.findInFile")}
            aria-label={t("searchPanel.findInFile")}
            aria-invalid={invalid || undefined}
            className={cn(
              "h-10 w-full rounded-lg border bg-background/60 pr-[7.5rem] pl-4 text-sm outline-none",
              invalid
                ? "border-destructive"
                : "border-border focus:border-foreground",
            )}
          />
          <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-0.5">
            <FindToggle
              pressed={caseSensitive}
              label={t("searchPanel.matchCase")}
              onPressedChange={setCaseSensitive}
            >
              <CaseSensitive className="size-3.5" />
            </FindToggle>
            <FindToggle
              pressed={wholeWord}
              label={t("searchPanel.wholeWord")}
              onPressedChange={setWholeWord}
            >
              <WholeWord className="size-3.5" />
            </FindToggle>
            <FindToggle
              pressed={regexp}
              label={t("searchPanel.regexp")}
              onPressedChange={setRegexp}
            >
              <Regex className="size-3.5" />
            </FindToggle>
          </div>
        </div>
      </div>
    </>
  );
}
