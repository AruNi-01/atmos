"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { useQueryState } from "nuqs";
import { TextShimmer } from "@workspace/ui";
import {
  localModelApi,
  type LocalModelStatus,
  type LocalModelListResponse,
} from "@/api/ws-api";
import { useWebSocketStore } from "@/hooks/use-websocket";
import { settingsModalParams } from "@/lib/nuqs/searchParams";

export function LocalModelDownloadProgress() {
  const [data, setData] = useState<LocalModelListResponse | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [, setIsSettingsOpen] = useQueryState("settingsModal", settingsModalParams.settingsModal);
  const [, setActiveSettingTab] = useQueryState("activeSettingTab", settingsModalParams.activeSettingTab);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await localModelApi.list();
      setData(res);
    } catch (e) {
      console.error("Failed to load local models:", e);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const unsub = useWebSocketStore.getState().onEvent("local_model_state_changed", (raw) => {
      const payload = raw as { state: LocalModelStatus };
      setData((prev) => {
        // Only update if state actually changed
        if (!prev) return { state: payload.state, models: [], runtime: { installed: false, version: null } };

        // Use JSON comparison for simplicity since LocalModelStatus is a complex union type
        if (JSON.stringify(prev.state) === JSON.stringify(payload.state)) {
          return prev;
        }

        return { ...prev, state: payload.state };
      });
    });
    return unsub;
  }, []);

  // Check if downloading
  const isDownloading = data?.state.status === "downloading_model";
  const isDownloadingRuntime = data?.state.status === "downloading_runtime";
  const progress =
    data?.state.status === "downloading_model" || data?.state.status === "downloading_runtime"
      ? data.state.progress * 100
      : null;
  const etaSeconds =
    data?.state.status === "downloading_model" || data?.state.status === "downloading_runtime"
      ? data.state.eta_seconds
      : null;

  // Poll while downloading to ensure progress updates even after page refresh
  useEffect(() => {
    const downloading = isDownloading || isDownloadingRuntime;
    if (downloading && !pollRef.current) {
      pollRef.current = setInterval(() => void load(), 2000);
    } else if (!downloading && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isDownloading, isDownloadingRuntime, load]);

  // Manage visibility - show when downloading, hide after completion with delay
  useEffect(() => {
    const downloading = isDownloading || isDownloadingRuntime;

    if (downloading) {
      setIsVisible(true);
    } else if (isVisible) {
      // Keep visible for a moment after completion, then hide
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isDownloading, isDownloadingRuntime]);

  if (!isVisible || progress === null) {
    return null;
  }

  const formatTimeRemaining = (seconds: number | null): string => {
    if (!seconds) return "";
    if (seconds >= 60) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.round(seconds % 60);
      return `${minutes}min ${remainingSeconds}s`;
    }
    return `${Math.round(seconds)}s`;
  };

  const handleClick = () => {
    // Open settings modal and navigate to AI section
    setIsSettingsOpen(true);
    setActiveSettingTab("ai");
  };

  const downloadText = isDownloadingRuntime ? "Downloading runtime" : "Downloading model";
  const progressText = `${Math.round(progress)}%`;
  const fullDownloadText = etaSeconds
    ? `${downloadText} — ~${formatTimeRemaining(etaSeconds)} remaining`
    : downloadText;

  return (
    <div
      className="desktop-no-drag flex h-7 items-center overflow-hidden rounded-md border border-border transition-colors hover:border-border/80"
      onMouseLeave={() => setIsExpanded(false)}
    >
      {/* Main indicator - always shows loading icon and progress */}
      <button
        onClick={handleClick}
        onMouseEnter={() => setIsExpanded(true)}
        className="flex h-full items-center rounded-md px-2 transition-all outline-none hover:cursor-pointer hover:bg-accent/50"
        title="Click to view download progress in settings"
      >
        <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
        <span className={`ml-2 whitespace-nowrap text-[13px] font-medium tabular-nums text-foreground transition-all duration-500 ease-out ${isExpanded ? 'max-w-16' : 'max-w-16'}`}>
          {progressText}
        </span>
        <span className={`ml-2 whitespace-nowrap text-[13px] font-medium text-muted-foreground tabular-nums transition-all duration-500 ease-out ${isExpanded ? 'max-w-96 opacity-100' : 'max-w-0 opacity-0'}`}>
          <TextShimmer as="span" duration={1.6} className="inline">
            {fullDownloadText}
          </TextShimmer>
        </span>
      </button>
    </div>
  );
}
