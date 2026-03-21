"use client";

import React, { useState } from 'react';
import { Monitor, Smartphone, RotateCw, ExternalLink, Home, Maximize, Minimize, ArrowLeft, ArrowRight, PanelTopOpen, PanelTopClose } from "lucide-react";
import { cn } from "@/lib/utils";


interface PreviewProps {
  url: string;
  setUrl: (url: string) => void;
  activeUrl: string;
  setActiveUrl: (url: string) => void;
}

export const Preview: React.FC<PreviewProps> = ({ url, setUrl, activeUrl, setActiveUrl }) => {
  // viewMode and iframeKey stay internal
  const [viewMode, setViewMode] = useState<"desktop" | "mobile">("desktop");
  const [iframeKey, setIframeKey] = useState(0); // To force refresh
  const [isMaximized, setIsMaximized] = useState(false);
  const [isToolbarHidden, setIsToolbarHidden] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < history.length - 1;

  const handleRefresh = () => {
    let finalUrl = url.trim();

    // Fix common typo: https:google.com -> https://google.com
    if (/^https?:\/\//.test(finalUrl) === false && /^https?:/.test(finalUrl)) {
      finalUrl = finalUrl.replace(/^(https?):/, "$1://");
    }
    // Add protocol if not present: http for local, https for others
    else if (!/^https?:\/\//.test(finalUrl) && finalUrl) {
      const isLocal = /^(localhost|127\.0\.0\.\d+|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|\[::1\])(:\d+)?/.test(finalUrl);
      finalUrl = isLocal ? `http://${finalUrl}` : `https://${finalUrl}`;
    }

    if (finalUrl !== url) {
      setUrl(finalUrl);
    }
    setActiveUrl(finalUrl);
    setIframeKey(prev => prev + 1);

    // Push to history (truncate forward history, cap at 100)
    if (finalUrl) {
      setHistory(prev => {
        const newHistory = [...prev.slice(0, historyIndex + 1), finalUrl];
        if (newHistory.length > 100) {
          const drop = newHistory.length - 100;
          setHistoryIndex(historyIndex + 1 - drop);
          return newHistory.slice(drop);
        }
        setHistoryIndex(historyIndex + 1);
        return newHistory;
      });
    }
  };

  const handleGoBack = () => {
    if (!canGoBack) return;
    const newIndex = historyIndex - 1;
    const prevUrl = history[newIndex];
    setHistoryIndex(newIndex);
    setUrl(prevUrl);
    setActiveUrl(prevUrl);
    setIframeKey(prev => prev + 1);
  };

  const handleGoForward = () => {
    if (!canGoForward) return;
    const newIndex = historyIndex + 1;
    const nextUrl = history[newIndex];
    setHistoryIndex(newIndex);
    setUrl(nextUrl);
    setActiveUrl(nextUrl);
    setIframeKey(prev => prev + 1);
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleRefresh();
    }
  }

  // Handle ESC key to exit fullscreen
  React.useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMaximized) {
        setIsMaximized(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isMaximized]);

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden bg-background transition-all duration-300 ease-in-out",
        isMaximized
          ? "fixed inset-0 z-50 w-screen h-screen animate-in fade-in zoom-in-95 slide-in-from-bottom-2"
          : "h-full w-full"
      )}
    >
      {/* Toolbar wrapper: when hidden, shrink to 5px trigger zone; on hover expand */}
      <div className={cn("shrink-0", isToolbarHidden && "group/toolbar pt-3 hover:pt-0 transition-all duration-300")}>
        <div
          className={cn(
            "h-10 flex items-center px-2 gap-2 bg-muted/10 transition-all duration-300 ease-in-out overflow-hidden",
            isToolbarHidden && "h-0 opacity-0 group-hover/toolbar:h-10 group-hover/toolbar:opacity-100"
          )}
        >
        {/* Device Toggle */}
        <div className="flex items-center border border-border rounded-md p-0.5 shrink-0">
          <button
            onClick={() => setViewMode("desktop")}
            className={cn(
              "p-1.5 rounded-sm transition-colors",
              viewMode === "desktop" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
            title="Desktop View"
          >
            <Monitor className="size-3.5" />
          </button>
          <button
            onClick={() => setViewMode("mobile")}
            className={cn(
              "p-1.5 rounded-sm transition-colors",
              viewMode === "mobile" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
            title="Mobile View"
          >
            <Smartphone className="size-3.5" />
          </button>
        </div>

        {/* Navigation Controls */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={handleGoBack}
            disabled={!canGoBack}
            className={cn(
              "p-1.5 rounded-sm transition-colors",
              canGoBack ? "text-muted-foreground hover:text-foreground hover:bg-muted" : "text-muted-foreground/30 cursor-not-allowed"
            )}
            title="Back"
          >
            <ArrowLeft className="size-3.5" />
          </button>
          <button
            onClick={handleGoForward}
            disabled={!canGoForward}
            className={cn(
              "p-1.5 rounded-sm transition-colors",
              canGoForward ? "text-muted-foreground hover:text-foreground hover:bg-muted" : "text-muted-foreground/30 cursor-not-allowed"
            )}
            title="Forward"
          >
            <ArrowRight className="size-3.5" />
          </button>
          <button
            onClick={handleRefresh}
            className="p-1.5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Refresh"
          >
            <RotateCw className="size-3.5" />
          </button>
        </div>

        {/* URL Bar */}
        <div className="flex-1 flex items-center gap-1 border border-border rounded-md px-1.5 h-7 mx-0.5 min-w-0 overflow-hidden">
          <Home className="size-3.5 text-muted-foreground shrink-0" />
          <input
            className="flex-1 bg-transparent border-none text-xs focus:outline-none placeholder:text-muted-foreground/50 h-full min-w-0"
            value={url}
            onChange={handleUrlChange}
            onKeyDown={handleKeyDown}
            placeholder="Enter URL..."
          />
          <a
            href={activeUrl || "#"}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "text-muted-foreground hover:text-foreground transition-colors p-0.5 shrink-0",
              !activeUrl && "pointer-events-none opacity-50"
            )}
          >
            <ExternalLink className="size-3" />
          </a>
        </div>

        {/* Auto-hide Toggle */}
        <button
          onClick={() => setIsToolbarHidden(!isToolbarHidden)}
          className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-sm hover:bg-muted shrink-0"
          title={isToolbarHidden ? "Show Toolbar" : "Auto-hide Toolbar"}
        >
          {isToolbarHidden ? (
            <PanelTopOpen className="size-3.5" />
          ) : (
            <PanelTopClose className="size-3.5" />
          )}
        </button>

        {/* Maximize Toggle */}
        <button
          onClick={() => setIsMaximized(!isMaximized)}
          className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-sm hover:bg-muted shrink-0"
          title={isMaximized ? "Minimize" : "Maximize"}
        >
          {isMaximized ? (
            <Minimize className="size-3.5" />
          ) : (
            <Maximize className="size-3.5" />
          )}
        </button>
        </div>
      </div>

      {/* Iframe Container */}
      <div className="flex-1 overflow-hidden relative w-full flex justify-center">
        {activeUrl ? (
          <iframe
            key={iframeKey}
            src={activeUrl}
            className={cn(
              "h-full transition-all duration-300 bg-white",
              viewMode === "mobile"
                ? "w-[375px] border-x border-border shadow-sm"
                : "w-full"
            )}
            title="Preview"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Enter a URL to preview
          </div>
        )}
      </div>
    </div>
  );
};
