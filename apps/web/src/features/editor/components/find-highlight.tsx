"use client";

import React, { createContext, useCallback, useContext, useState } from "react";
import type { FindHighlightBox, MarkdownFindQuery } from "@/features/editor/lib/markdown-find";
import { SEARCH_MATCH_BACKGROUND } from "@/shared/lib/search-highlight";

const FindHighlightBoxesContext = createContext<FindHighlightBox[]>([]);
const FindHighlightSetContext = createContext<((boxes: FindHighlightBox[]) => void) | null>(null);
const FindSearchQueryContext = createContext<MarkdownFindQuery | null>(null);
const SetFindSearchQueryContext = createContext<
  ((query: MarkdownFindQuery | null) => void) | null
>(null);
const FindLayoutNonceContext = createContext(0);
const RequestFindRelayoutContext = createContext<() => void>(() => {});

const noopSetFindQuery: (query: MarkdownFindQuery | null) => void = () => {};

export function FindHighlightProvider({ children }: { children: React.ReactNode }) {
  const [boxes, setBoxes] = useState<FindHighlightBox[]>([]);
  const [query, setQuery] = useState<MarkdownFindQuery | null>(null);
  const [layoutNonce, setLayoutNonce] = useState(0);
  const requestRelayout = useCallback(() => {
    setLayoutNonce((nonce) => nonce + 1);
  }, []);

  return (
    <SetFindSearchQueryContext.Provider value={setQuery}>
      <FindSearchQueryContext.Provider value={query}>
        <FindLayoutNonceContext.Provider value={layoutNonce}>
          <RequestFindRelayoutContext.Provider value={requestRelayout}>
            <FindHighlightSetContext.Provider value={setBoxes}>
              <FindHighlightBoxesContext.Provider value={boxes}>
                {children}
              </FindHighlightBoxesContext.Provider>
            </FindHighlightSetContext.Provider>
          </RequestFindRelayoutContext.Provider>
        </FindLayoutNonceContext.Provider>
      </FindSearchQueryContext.Provider>
    </SetFindSearchQueryContext.Provider>
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
          className="absolute rounded-sm"
          style={{
            top: box.top,
            left: box.left,
            width: box.width,
            height: box.height,
            backgroundColor: SEARCH_MATCH_BACKGROUND,
          }}
        />
      ))}
    </div>
  );
}

export function useSetFindHighlightBoxes(): ((boxes: FindHighlightBox[]) => void) | null {
  return useContext(FindHighlightSetContext);
}

export function useFindSearchQuery(): MarkdownFindQuery | null {
  return useContext(FindSearchQueryContext);
}

export function useSetFindSearchQuery(): (query: MarkdownFindQuery | null) => void {
  return useContext(SetFindSearchQueryContext) ?? noopSetFindQuery;
}

export function useFindLayoutNonce(): number {
  return useContext(FindLayoutNonceContext);
}

export function useRequestFindRelayout(): () => void {
  return useContext(RequestFindRelayoutContext);
}
