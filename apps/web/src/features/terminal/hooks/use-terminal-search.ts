import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { SearchAddon } from "@xterm/addon-search";
import type { ISearchOptions } from "@xterm/addon-search";
import type { Terminal as XTerm } from "@xterm/xterm";

interface UseTerminalSearchArgs {
  isDark: boolean;
  searchAddonRef: React.RefObject<SearchAddon | null>;
  terminalRef: React.RefObject<XTerm | null>;
}

export function useTerminalSearch({
  isDark,
  searchAddonRef,
  terminalRef,
}: UseTerminalSearchArgs) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const terminalSearchInputId = useId();
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHasMatch, setSearchHasMatch] = useState<boolean | null>(null);
  const [searchStats, setSearchStats] = useState<{ current: number; total: number }>({
    current: 0,
    total: 0,
  });

  const runSearch = useCallback((direction: "next" | "previous", queryOverride?: string) => {
    const addon = searchAddonRef.current;
    const query = queryOverride ?? searchQuery;
    if (!addon || !query.trim()) {
      setSearchHasMatch(null);
      setSearchStats({ current: 0, total: 0 });
      return false;
    }

    const options: ISearchOptions = {
      caseSensitive: false,
      regex: false,
      wholeWord: false,
      incremental: true,
      decorations: {
        matchBackground: isDark ? "#27272a" : "#d4d4d8",
        matchBorder: isDark ? "#3f3f46" : "#a1a1aa",
        matchOverviewRuler: isDark ? "#52525b" : "#71717a",
        activeMatchBackground: isDark ? "#f4f4f5" : "#18181b",
        activeMatchBorder: isDark ? "#fafafa" : "#09090b",
        activeMatchColorOverviewRuler: isDark ? "#fafafa" : "#18181b",
      },
    };

    const matched =
      direction === "previous"
        ? addon.findPrevious(query, options)
        : addon.findNext(query, options);

    setSearchHasMatch(matched);
    return matched;
  }, [isDark, searchAddonRef, searchQuery]);

  const closeSearch = useCallback(() => {
    setIsSearchVisible(false);
    setSearchQuery("");
    setSearchHasMatch(null);
    setSearchStats({ current: 0, total: 0 });
    searchAddonRef.current?.clearDecorations();
    terminalRef.current?.focus();
  }, [searchAddonRef, terminalRef]);

  useEffect(() => {
    if (!isSearchVisible) return;
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, [isSearchVisible]);

  const handleSearchQueryChange = useCallback((nextQuery: string) => {
    setSearchQuery(nextQuery);
    if (!nextQuery.trim()) {
      setSearchHasMatch(null);
      setSearchStats({ current: 0, total: 0 });
      searchAddonRef.current?.clearDecorations();
      return;
    }
    runSearch("next", nextQuery);
  }, [runSearch, searchAddonRef]);

  const openSearch = useCallback(() => {
    const terminal = terminalRef.current;
    const currentSelection = terminal?.hasSelection() ? terminal.getSelection().trim() : "";
    setIsSearchVisible(true);
    if (currentSelection) {
      handleSearchQueryChange(currentSelection);
    }
  }, [handleSearchQueryChange, terminalRef]);

  return {
    closeSearch,
    handleSearchQueryChange,
    isSearchVisible,
    openSearch,
    runSearch,
    searchHasMatch,
    searchInputRef,
    searchQuery,
    searchStats,
    setSearchStats,
    terminalSearchInputId,
  };
}
