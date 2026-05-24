import { useCallback, useEffect, useRef } from "react";
import type { Terminal as XTerm } from "@xterm/xterm";
import { toastManager } from "@workspace/ui";

import { appApi } from "@/api/ws-api";
import { useEditorStore } from "@/features/editor/store/use-editor-store";
import { useTerminalLinkSettings } from "@/features/settings/hooks/use-terminal-link-settings";
import { openDesktopExternalUrl } from "@/shared/lib/desktop-external-url";
import {
  resolveTerminalLink,
  resolveTerminalLinkAtCell,
  type ResolvedTerminalLink,
} from "../lib/terminal-link-routing";

interface UseTerminalLinksArgs {
  containerRef: React.RefObject<HTMLDivElement | null>;
  cwd?: string;
  projectRootPath?: string;
  terminalRef: React.RefObject<XTerm | null>;
  workspaceId: string;
}

export function useTerminalLinks({
  containerRef,
  cwd,
  projectRootPath,
  terminalRef,
  workspaceId,
}: UseTerminalLinksArgs) {
  const modifierKeyPressedRef = useRef(false);
  const pointerModifierPressedRef = useRef(false);
  const handleTerminalLinkRef = useRef<(event: MouseEvent, resolved: ResolvedTerminalLink) => Promise<void>>(async () => {});
  const handleResolvedLinkRef = useRef<(event: MouseEvent, rawText: string) => Promise<void>>(async () => {});
  const openFile = useEditorStore((state) => state.openFile);
  const requestFileTreeReveal = useEditorStore((state) => state.requestFileTreeReveal);
  const currentEditorContextId = useEditorStore((state) => state.currentWorkspaceId);
  const {
    fileLinkOpenMode,
    fileLinkOpenApp,
    loadSettings: loadTerminalLinkSettings,
  } = useTerminalLinkSettings();

  useEffect(() => {
    void loadTerminalLinkSettings();
  }, [loadTerminalLinkSettings]);

  useEffect(() => {
    const handleKeyStateChange = (event: KeyboardEvent) => {
      modifierKeyPressedRef.current = event.metaKey || event.ctrlKey;
    };

    const clearModifierState = () => {
      modifierKeyPressedRef.current = false;
    };

    window.addEventListener("keydown", handleKeyStateChange, true);
    window.addEventListener("keyup", handleKeyStateChange, true);
    window.addEventListener("blur", clearModifierState);

    return () => {
      window.removeEventListener("keydown", handleKeyStateChange, true);
      window.removeEventListener("keyup", handleKeyStateChange, true);
      window.removeEventListener("blur", clearModifierState);
    };
  }, []);

  const updatePointerModifierState = useCallback((event?: MouseEvent | globalThis.MouseEvent) => {
    pointerModifierPressedRef.current = Boolean(event && (event.metaKey || event.ctrlKey));
  }, []);

  useEffect(() => {
    const handleGlobalMouseDown = (event: MouseEvent) => {
      updatePointerModifierState(event);
    };

    const clearPointerModifierState = () => {
      pointerModifierPressedRef.current = false;
    };

    window.addEventListener("mousedown", handleGlobalMouseDown, true);
    window.addEventListener("mouseup", clearPointerModifierState, true);
    window.addEventListener("blur", clearPointerModifierState);

    return () => {
      window.removeEventListener("mousedown", handleGlobalMouseDown, true);
      window.removeEventListener("mouseup", clearPointerModifierState, true);
      window.removeEventListener("blur", clearPointerModifierState);
    };
  }, [updatePointerModifierState]);

  const reportTerminalLinkError = useCallback((target: string, error: unknown) => {
    const description = error instanceof Error ? error.message : String(error);
    toastManager.add({
      title: "Failed to open link",
      description: `${target}: ${description}`,
      type: "error",
    });
  }, []);

  const openExternalLink = useCallback(async (url: string) => {
    const openedByDesktop = await openDesktopExternalUrl(url);
    if (openedByDesktop || typeof window === "undefined") {
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const openPathWithApp = useCallback(async (appName: string, path: string) => {
    await appApi.openWith(appName, path);
  }, []);

  const handleTerminalLink = useCallback(async (event: MouseEvent, resolved: ResolvedTerminalLink) => {
    if (!resolved) {
      return;
    }

    const modifierPressed =
      event.metaKey ||
      event.ctrlKey ||
      modifierKeyPressedRef.current ||
      pointerModifierPressedRef.current;

    event.preventDefault();

    try {
      if (resolved.type === "external") {
        if (!modifierPressed) {
          return;
        }
        await openExternalLink(resolved.url);
        return;
      }

      const targetContextId = currentEditorContextId || workspaceId;

      if (fileLinkOpenMode === "finder") {
        await openPathWithApp("Finder", resolved.path);
        return;
      }

      if (fileLinkOpenMode === "app") {
        await openPathWithApp(fileLinkOpenApp, resolved.path);
        return;
      }

      if (resolved.type === "directory") {
        requestFileTreeReveal(resolved.path, targetContextId);
        return;
      }

      await openFile(resolved.path, targetContextId, {
        preview: false,
        line: resolved.line,
        column: resolved.column,
      });
    } catch (error) {
      reportTerminalLinkError(
        resolved.type === "external" ? resolved.url : resolved.path,
        error,
      );
    }
  }, [
    currentEditorContextId,
    fileLinkOpenApp,
    fileLinkOpenMode,
    openExternalLink,
    openFile,
    openPathWithApp,
    reportTerminalLinkError,
    requestFileTreeReveal,
    workspaceId,
  ]);

  const handleResolvedLink = useCallback(async (event: MouseEvent, rawText: string) => {
    const resolved = await resolveTerminalLink(rawText, {
      cwdPath: cwd,
      projectRootPath,
    });

    await handleTerminalLink(event, resolved);
  }, [cwd, handleTerminalLink, projectRootPath]);

  useEffect(() => {
    handleTerminalLinkRef.current = handleTerminalLink;
  }, [handleTerminalLink]);

  useEffect(() => {
    handleResolvedLinkRef.current = handleResolvedLink;
  }, [handleResolvedLink]);

  const getAnchorCandidates = useCallback((anchor: HTMLAnchorElement) => {
    const candidates: string[] = [];
    const textContent = anchor.textContent?.trim();
    const rawHref = anchor.getAttribute("href")?.trim();

    if (textContent) {
      candidates.push(textContent);
    }

    if (!rawHref) {
      return candidates;
    }

    candidates.push(rawHref);

    return [...new Set(candidates)];
  }, []);

  const handleTerminalAnchorActivation = useCallback((anchor: HTMLAnchorElement, event: MouseEvent) => {
    const candidates = getAnchorCandidates(anchor);
    const shouldIntercept = candidates.some((candidate) =>
      candidate.startsWith("/") ||
      candidate.startsWith("~/") ||
      candidate.startsWith("./") ||
      candidate.startsWith("../") ||
      candidate.startsWith("file://")
    );
    if (shouldIntercept) {
      event.preventDefault();
      event.stopPropagation();
    }

    void (async () => {
      for (const candidate of candidates) {
        const resolved = await resolveTerminalLink(candidate, {
          cwdPath: cwd,
          projectRootPath,
        });
        if (!resolved || resolved.type === "external") {
          continue;
        }

        await handleTerminalLink(event, resolved);
        return;
      }
    })();
  }, [cwd, getAnchorCandidates, handleTerminalLink, projectRootPath]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNativeMouseActivation = (event: MouseEvent) => {
      const terminal = terminalRef.current;
      if (!terminal) {
        return;
      }

      const target = event.target;
      if (!(target instanceof HTMLCanvasElement) || !target.classList.contains("xterm-link-layer")) {
        return;
      }

      const core = (terminal as unknown as {
        _core?: {
          _mouseService?: {
            getCoords: (
              event: MouseEvent,
              element: HTMLElement,
              colCount: number,
              rowCount: number,
            ) => [number, number] | undefined;
          };
        };
      })._core;

      const coords = core?._mouseService?.getCoords(
        event,
        terminal.element ?? container,
        terminal.cols,
        terminal.rows,
      );
      if (!coords) {
        return;
      }

      const bufferLineNumber = coords[1] + terminal.buffer.active.viewportY;
      const column = coords[0];
      void (async () => {
        const resolved = await resolveTerminalLinkAtCell(
          terminal,
          bufferLineNumber,
          column,
          { cwdPath: cwd, projectRootPath },
        );
        if (!resolved || resolved.type === "external") {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        await handleTerminalLink(event, resolved);
      })();
    };

    const handleNativeClickCapture = (event: MouseEvent) => {
      handleNativeMouseActivation(event);
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const anchor = target.closest("a");
      if (!anchor) {
        return;
      }

      handleTerminalAnchorActivation(anchor, event);
    };

    container.addEventListener("click", handleNativeClickCapture, true);
    return () => {
      container.removeEventListener("click", handleNativeClickCapture, true);
    };
  }, [containerRef, cwd, handleTerminalAnchorActivation, handleTerminalLink, projectRootPath, terminalRef]);

  return {
    handleResolvedLinkRef,
    handleTerminalLinkRef,
    updatePointerModifierState,
  };
}
