"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  contentFindHighlightRect,
  findMarkdownHits,
  markdownFindCounter,
  resolveFindHighlightHost,
  scrollMarkdownFindHitIntoView,
  type FindHighlightBox,
  type MarkdownFindHit,
  type MarkdownFindQuery,
} from "@/features/editor/lib/markdown-find";
import "./find-panel.css";

function selectedSearchSeed(): string {
  const text = window.getSelection()?.toString() ?? "";
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.length > 200) return "";
  return trimmed;
}

type FindHighlightSetter = (boxes: FindHighlightBox[]) => void;

const FindHighlightBoxesContext = createContext<FindHighlightBox[]>([]);
const FindHighlightSetContext = createContext<FindHighlightSetter | null>(null);

export function FindHighlightProvider({ children }: { children: React.ReactNode }) {
  const [boxes, setBoxes] = useState<FindHighlightBox[]>([]);
  return (
    <FindHighlightSetContext.Provider value={setBoxes}>
      <FindHighlightBoxesContext.Provider value={boxes}>
        {children}
      </FindHighlightBoxesContext.Provider>
    </FindHighlightSetContext.Provider>
  );
}

export function FindHighlightLayer() {
  const boxes = useContext(FindHighlightBoxesContext);
  if (boxes.length === 0) return null;
  return (
    <div
      data-markdown-find-highlight=""
      className="pointer-events-none absolute inset-0 z-10 overflow-visible"
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
    </div>
  );
}

function hitBoxes(
  root: HTMLElement,
  hits: MarkdownFindHit[],
  currentIndex: number,
): FindHighlightBox[] {
  const origin = resolveFindHighlightHost(root).getBoundingClientRect();
  const boxes: FindHighlightBox[] = [];
  hits.forEach((hit, index) => {
    const range = root.ownerDocument.createRange();
    try {
      range.setStart(hit.startNode, hit.startOffset);
      range.setEnd(hit.endNode, hit.endOffset);
    } catch {
      return;
    }
    for (const rect of Array.from(range.getClientRects())) {
      const box = contentFindHighlightRect(rect, origin);
      if (!box) continue;
      boxes.push({ ...box, current: index === currentIndex });
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
    <label
      className={cn("cm-atmos-search__toggle", pressed && "is-active")}
      title={label}
      aria-label={label}
    >
      <input
        type="checkbox"
        className="cm-atmos-search__toggle-input"
        checked={pressed}
        onChange={() => onPressedChange(!pressed)}
      />
      {children}
    </label>
  );
}

export function useFindPanel(enabled: boolean): {
  open: boolean;
  setOpen: (open: boolean) => void;
  focusNonce: number;
} {
  const [open, setOpen] = useState(false);
  const [focusNonce, setFocusNonce] = useState(0);

  useHotkeys(
    "mod+f",
    (event) => {
      event.preventDefault();
      setOpen(true);
      setFocusNonce((value) => value + 1);
    },
    {
      enabled,
      enableOnContentEditable: true,
      enableOnFormTags: true,
      preventDefault: true,
    },
    [enabled],
  );

  return { open, setOpen, focusNonce };
}

export function FindPanel({
  open,
  root,
  seed,
  resetKey,
  seedFromSelection = false,
  scopeSelector,
  placeholder,
  focusNonce,
  onClose,
  onQueryChange,
}: {
  open: boolean;
  root: HTMLElement | null;
  seed?: string;
  resetKey?: string | number;
  seedFromSelection?: boolean;
  scopeSelector?: string;
  placeholder?: string;
  focusNonce?: number;
  onClose: () => void;
  onQueryChange?: (query: MarkdownFindQuery) => void;
}) {
  const t = useTranslations("editor.codeMirrorSearchPanel");
  const inputRef = useRef<HTMLInputElement>(null);
  const setBoxes = useContext(FindHighlightSetContext);
  const activeIndexRef = useRef(0);
  const [search, setSearch] = useState(seed ?? "");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [regexp, setRegexp] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [hitCount, setHitCount] = useState(0);
  const [invalid, setInvalid] = useState(false);
  const hitsRef = useRef<MarkdownFindHit[]>([]);
  const findPlaceholder = placeholder ?? t("find");
  activeIndexRef.current = activeIndex;

  const query = useMemo<MarkdownFindQuery>(
    () => ({ search, caseSensitive, wholeWord, regexp }),
    [search, caseSensitive, wholeWord, regexp],
  );

  useEffect(() => {
    onQueryChange?.(open ? query : { ...query, search: "" });
  }, [onQueryChange, open, query]);

  const paintHits = useCallback(
    (hits: MarkdownFindHit[], index: number) => {
      if (!setBoxes) return;
      if (!root) {
        setBoxes([]);
        return;
      }
      setBoxes(hitBoxes(root, hits, index));
    },
    [root, setBoxes],
  );

  const scan = useCallback(
    (opts?: { index?: number; scroll?: boolean }) => {
      if (!open || !root) {
        hitsRef.current = [];
        setBoxes?.([]);
        setHitCount(0);
        setInvalid(false);
        return;
      }
      const previousCount = hitsRef.current.length;
      const { hits, invalid: nextInvalid } = findMarkdownHits(root, query, {
        scopeSelector,
      });
      hitsRef.current = hits;
      const grewFromEmpty = previousCount === 0 && hits.length > 0;
      const index =
        hits.length === 0
          ? 0
          : Math.min(
              grewFromEmpty ? 0 : (opts?.index ?? activeIndexRef.current),
              hits.length - 1,
            );
      setActiveIndex(index);
      setHitCount(hits.length);
      setInvalid(nextInvalid);
      paintHits(hits, index);
      if (opts?.scroll === false && !grewFromEmpty) return;
      const current = hits[index];
      if (current) scrollMarkdownFindHitIntoView(root, current);
    },
    [open, paintHits, query, root, scopeSelector, setBoxes],
  );

  useEffect(() => {
    if (seed === undefined && resetKey === undefined) return;
    setSearch(seed ?? "");
    setActiveIndex(0);
  }, [resetKey, seed]);

  useEffect(() => {
    if (!open || !seedFromSelection) return;
    const next = selectedSearchSeed();
    if (next) setSearch(next);
  }, [open, seedFromSelection]);

  useLayoutEffect(() => {
    scan({ index: 0 });
    // Query changes should restart at the first hit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, root, scopeSelector]);

  useLayoutEffect(() => {
    if (!open || !root) return;
    paintHits(hitsRef.current, activeIndexRef.current);
  }, [open, paintHits, root, hitCount]);

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(id);
  }, [focusNonce, open, resetKey]);

  useEffect(() => {
    if (!open || !root) return;
    let frame: number | null = null;
    const onLayout = () => {
      if (frame != null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        paintHits(hitsRef.current, activeIndexRef.current);
      });
    };
    window.addEventListener("resize", onLayout);
    const resizeObserver = new ResizeObserver(onLayout);
    resizeObserver.observe(root);
    const host = resolveFindHighlightHost(root);
    if (host !== root) resizeObserver.observe(host);
    const observer = new MutationObserver((mutations) => {
      const isFindChrome = (node: Node | null) => {
        const element = node instanceof Element ? node : node?.parentElement;
        return Boolean(
          element?.closest("[data-markdown-find-highlight], [data-markdown-find-panel]"),
        );
      };
      const relevant = mutations.some((mutation) => {
        if (isFindChrome(mutation.target)) return false;
        const sideNodes = [...mutation.addedNodes, ...mutation.removedNodes];
        if (sideNodes.length > 0 && sideNodes.every(isFindChrome)) return false;
        const node =
          mutation.target instanceof Element
            ? mutation.target
            : mutation.target.parentElement;
        return !node?.closest(
          "[data-markdown-find-highlight], [data-markdown-find-panel]",
        );
      });
      if (!relevant) return;
      scan({ index: activeIndexRef.current, scroll: false });
    });
    observer.observe(root, { subtree: true, childList: true, characterData: true });
    return () => {
      window.removeEventListener("resize", onLayout);
      resizeObserver.disconnect();
      observer.disconnect();
      if (frame != null) window.cancelAnimationFrame(frame);
    };
  }, [open, paintHits, root, scan]);

  const goTo = useCallback(
    (direction: 1 | -1) => {
      const hits = hitsRef.current;
      if (!root || hits.length === 0) return;
      const next = (activeIndexRef.current + direction + hits.length) % hits.length;
      setActiveIndex(next);
      paintHits(hits, next);
      const current = hits[next];
      if (current) scrollMarkdownFindHitIntoView(root, current);
    },
    [paintHits, root],
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
  const hasMatches = Boolean(counter);

  return (
    <div
      data-markdown-find-panel=""
      className="cm-atmos-search pointer-events-auto absolute top-2 right-2 z-30 w-[min(26rem,calc(100%-1rem))]"
    >
        <div className="cm-atmos-search__header">
          <div className="cm-atmos-search__title-group">
            <span className="cm-atmos-search__title">{t("find")}</span>
            {counter ? (
              <span
                data-markdown-find-count={counter}
                className="cm-atmos-search__counter"
              >
                {counter}
              </span>
            ) : null}
            <button
              type="button"
              className={cn(
                "cm-atmos-search__icon-button cm-atmos-search__nav-button",
                !hasMatches && "is-hidden",
              )}
              title={t("previousMatch")}
              aria-label={t("previousMatch")}
              onClick={() => goTo(-1)}
            >
              <ChevronLeft className="cm-atmos-search__icon" />
            </button>
            <button
              type="button"
              className={cn(
                "cm-atmos-search__icon-button cm-atmos-search__nav-button",
                !hasMatches && "is-hidden",
              )}
              title={t("nextMatch")}
              aria-label={t("nextMatch")}
              onClick={() => goTo(1)}
            >
              <ChevronRight className="cm-atmos-search__icon" />
            </button>
          </div>
          <div className="cm-atmos-search__header-actions">
            <button
              type="button"
              className="cm-atmos-search__icon-button"
              title={t("closeSearch")}
              aria-label={t("closeSearch")}
              onClick={onClose}
            >
              <X className="cm-atmos-search__icon" />
            </button>
          </div>
        </div>
        <div className="cm-atmos-search__fields">
          <div className="cm-atmos-search__row">
            <div className="cm-atmos-search__field">
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
                placeholder={findPlaceholder}
                aria-label={findPlaceholder}
                aria-invalid={invalid || undefined}
                className="cm-atmos-search__input"
              />
              <div className="cm-atmos-search__inline-options">
                <FindToggle
                  pressed={caseSensitive}
                  label={t("matchCase")}
                  onPressedChange={setCaseSensitive}
                >
                  <CaseSensitive className="cm-atmos-search__icon" />
                </FindToggle>
                <FindToggle
                  pressed={wholeWord}
                  label={t("wholeWord")}
                  onPressedChange={setWholeWord}
                >
                  <WholeWord className="cm-atmos-search__icon" />
                </FindToggle>
                <FindToggle
                  pressed={regexp}
                  label={t("regexp")}
                  onPressedChange={setRegexp}
                >
                  <Regex className="cm-atmos-search__icon" />
                </FindToggle>
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}
