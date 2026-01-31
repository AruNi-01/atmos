"use client";

import React, { useState } from 'react';
import { Monitor, Smartphone, RotateCw, ExternalLink, Home } from "lucide-react";
import { cn } from "@/lib/utils";

export const Preview = () => {
  // Default to a placeholder, can be updated by user
  const [url, setUrl] = useState("http://localhost:3000");
  const [viewMode, setViewMode] = useState<"desktop" | "mobile">("desktop");
  const [iframeKey, setIframeKey] = useState(0); // To force refresh

  const handleRefresh = () => {
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

  return (
    <div className="flex flex-col h-full w-full bg-background overflow-hidden">
      {/* Toolbar */}
      <div className="h-10 border-b border-border flex items-center px-2 gap-2 shrink-0 bg-muted/20">
        {/* Device Toggle */}
        <div className="flex items-center bg-background border border-border rounded-md p-0.5">
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

        {/* URL Bar */}
        <div className="flex-1 flex items-center gap-2 bg-background border border-border rounded-md px-2 h-7 mx-1">
          <Home className="size-3.5 text-muted-foreground shrink-0" />
          <input
            className="flex-1 bg-transparent border-none text-xs focus:outline-none placeholder:text-muted-foreground/50 h-full min-w-0"
            value={url}
            onChange={handleUrlChange}
            onKeyDown={handleKeyDown}
            placeholder="Enter URL..."
          />
          <button onClick={handleRefresh} className="text-muted-foreground hover:text-foreground transition-colors p-0.5">
            <RotateCw className="size-3" />
          </button>
          <a href={url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground transition-colors p-0.5">
            <ExternalLink className="size-3" />
          </a>
        </div>
      </div>

      {/* Iframe Container */}
      <div className="flex-1 overflow-hidden relative bg-muted/10 w-full flex justify-center border-b border-border">
        <iframe
          key={iframeKey}
          src={url}
          className={cn(
            "h-full bg-white transition-all duration-300 shadow-sm border-x border-border",
            viewMode === "mobile" ? "w-[375px]" : "w-full"
          )}
          title="Preview"
        />
      </div>
    </div>
  );
};
