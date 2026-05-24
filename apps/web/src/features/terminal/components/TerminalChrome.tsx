import { ArrowDown, ChevronDown, ChevronUp, Loader2, Search, X } from "lucide-react";
import { Button, cn } from "@workspace/ui";
import type { RefObject } from "react";
import type { ITheme } from "@xterm/xterm";
import { isFindShortcut } from "../lib/terminal-runtime-utils";

type TerminalUiStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

interface TerminalChromeProps {
  className?: string;
  closeSearch: () => void;
  containerRef: RefObject<HTMLDivElement | null>;
  currentTheme: ITheme;
  handleSearchQueryChange: (nextQuery: string) => void;
  isConnected: boolean;
  isDark: boolean;
  isSearchVisible: boolean;
  onOpenSearch: () => void;
  onPointerModifierStateChange: (event?: MouseEvent | globalThis.MouseEvent) => void;
  onScrollToBottom: () => void;
  runSearch: (direction: "next" | "previous", queryOverride?: string) => boolean;
  searchHasMatch: boolean | null;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
  searchStats: { current: number; total: number };
  sessionId: string;
  showScrollDown: boolean;
  terminalSearchInputId: string;
  uiStatus: TerminalUiStatus;
  workspaceId: string;
}

export function TerminalChrome({
  className,
  closeSearch,
  containerRef,
  currentTheme,
  handleSearchQueryChange,
  isConnected,
  isDark,
  isSearchVisible,
  onOpenSearch,
  onPointerModifierStateChange,
  onScrollToBottom,
  runSearch,
  searchHasMatch,
  searchInputRef,
  searchQuery,
  searchStats,
  sessionId,
  showScrollDown,
  terminalSearchInputId,
  uiStatus,
  workspaceId,
}: TerminalChromeProps) {
  return (
    <div
      className="terminal-padding-wrapper"
      onKeyDownCapture={(event) => {
        if (isFindShortcut(event)) {
          event.preventDefault();
          event.stopPropagation();
          onOpenSearch();
        }
      }}
      onMouseDownCapture={(event) => {
        onPointerModifierStateChange(event.nativeEvent);
      }}
      onMouseUpCapture={() => {
        onPointerModifierStateChange();
      }}
      style={{
        width: "100%",
        height: "100%",
        padding: "8px 0 8px 8px",
        backgroundColor: "transparent",
        position: "relative",
        boxSizing: "border-box",
      }}
    >
      {uiStatus === "connecting" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 20,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "var(--background)",
            gap: "12px",
          }}
        >
          <Loader2
            size={24}
            className="animate-spin"
            suppressHydrationWarning
            style={{
              color: isDark ? "#71717a" : "#a1a1aa",
            }}
          />
          <span
            suppressHydrationWarning
            style={{
              fontSize: "13px",
              color: isDark ? "#71717a" : "#a1a1aa",
            }}
          >
            Connecting to terminal...
          </span>
        </div>
      )}
      {uiStatus === "reconnecting" && (
        <TerminalStatusBadge
          label="Reconnecting..."
          backgroundColor="rgba(234, 179, 8, 0.2)"
          color="#eab308"
        />
      )}
      {uiStatus === "disconnected" && (
        <TerminalStatusBadge
          label="Disconnected"
          backgroundColor="rgba(239, 68, 68, 0.2)"
          color="#ef4444"
        />
      )}
      {isSearchVisible && (
        <TerminalSearchOverlay
          closeSearch={closeSearch}
          handleSearchQueryChange={handleSearchQueryChange}
          inputId={terminalSearchInputId}
          inputRef={searchInputRef}
          runSearch={runSearch}
          searchHasMatch={searchHasMatch}
          searchQuery={searchQuery}
          searchStats={searchStats}
        />
      )}
      <div
        ref={containerRef}
        className={`atmos-terminal ${className || ""}`}
        suppressHydrationWarning
        style={{
          width: "100%",
          height: "100%",
          opacity: uiStatus === "connecting" ? 0 : 1,
          backgroundColor: currentTheme.background,
        }}
        data-session-id={sessionId}
        data-workspace-id={workspaceId}
        data-connected={isConnected}
        data-status={uiStatus}
      />
      {showScrollDown && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Scroll to bottom"
          title="Scroll to bottom"
          className="terminal-scroll-to-bottom"
          onClick={onScrollToBottom}
        >
          <ArrowDown className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

function TerminalStatusBadge({
  backgroundColor,
  color,
  label,
}: {
  backgroundColor: string;
  color: string;
  label: string;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: "4px",
        right: "8px",
        zIndex: 10,
        padding: "2px 8px",
        borderRadius: "4px",
        backgroundColor,
        color,
        fontSize: "12px",
      }}
    >
      {label}
    </div>
  );
}

function TerminalSearchOverlay({
  closeSearch,
  handleSearchQueryChange,
  inputId,
  inputRef,
  runSearch,
  searchHasMatch,
  searchQuery,
  searchStats,
}: {
  closeSearch: () => void;
  handleSearchQueryChange: (nextQuery: string) => void;
  inputId: string;
  inputRef: RefObject<HTMLInputElement | null>;
  runSearch: (direction: "next" | "previous", queryOverride?: string) => boolean;
  searchHasMatch: boolean | null;
  searchQuery: string;
  searchStats: { current: number; total: number };
}) {
  return (
    <div className="terminal-search-overlay">
      <div className="terminal-search-panel">
        <label htmlFor={inputId} className="terminal-search-icon">
          <Search size={13} />
        </label>
        <input
          id={inputId}
          ref={inputRef}
          value={searchQuery}
          onChange={(event) => {
            handleSearchQueryChange(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closeSearch();
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              runSearch(event.shiftKey ? "previous" : "next");
            }
          }}
          placeholder="Search terminal"
          spellCheck={false}
          className={cn(
            "terminal-search-input",
            searchHasMatch === false && "terminal-search-input-miss"
          )}
        />
        <div className="terminal-search-meta">
          {searchQuery.trim()
            ? `${searchStats.current}/${searchStats.total}`
            : "0/0"}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="terminal-search-btn"
          aria-label="Previous match"
          onClick={() => runSearch("previous")}
          disabled={!searchQuery.trim()}
        >
          <ChevronUp size={13} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="terminal-search-btn"
          aria-label="Next match"
          onClick={() => runSearch("next")}
          disabled={!searchQuery.trim()}
        >
          <ChevronDown size={13} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="terminal-search-btn terminal-search-close"
          aria-label="Close search"
          onClick={closeSearch}
        >
          <X size={13} />
        </Button>
      </div>
    </div>
  );
}
