"use client";

import { useCallback, useEffect, useState } from "react";
import { activateCenterChromeTab } from "@/app-shell/center-stage-activate";
import { FILES_TAB_VALUE } from "@/app-shell/center-tool-tabs";
import { useCenterPaintContextId } from "@/app-shell/center-space/use-center-paint-context-id";
import { useEditorStore } from "@/features/editor/store/use-editor-store";
import { useAgentChatCwd, useAgentChatPathRoots } from "../components/agent-chat-cwd-context";
import {
  agentChatPathLooksLikeDirectory,
  resolveAgentChatOpenableFile,
} from "@/features/agent/lib/agent-chat-file-links";
import { resolveAgentChatPathKind } from "@/features/agent/lib/agent-chat-path-kind";

export type AgentChatResolvedPathKind = "pending" | "file" | "directory" | "missing";

export function useAgentChatResolvedPathKind(
  path: string | null | undefined,
): AgentChatResolvedPathKind {
  const [kind, setKind] = useState<AgentChatResolvedPathKind>(path ? "pending" : "missing");

  useEffect(() => {
    if (!path) {
      setKind("missing");
      return;
    }
    setKind("pending");
    let cancelled = false;
    void resolveAgentChatPathKind(path).then((resolved) => {
      if (!cancelled) setKind(resolved ?? "missing");
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return kind;
}

export function useAgentChatPathIsDir(path: string | null | undefined): boolean {
  const kind = useAgentChatResolvedPathKind(path);
  if (kind === "directory") return true;
  if (kind === "file" || kind === "missing") return false;
  return Boolean(path) && agentChatPathLooksLikeDirectory(path as string);
}

export function useOpenAgentChatWorkspacePath() {
  const cwd = useAgentChatCwd();
  const roots = useAgentChatPathRoots();
  const paintContextId = useCenterPaintContextId();
  const openFile = useEditorStore((state) => state.openFile);
  const requestFileTreeReveal = useEditorStore((state) => state.requestFileTreeReveal);

  return useCallback(async (
    rawPath: string,
    options?: { line?: number; preview?: boolean; isDir?: boolean },
  ) => {
    if (!paintContextId) return;
    const openable = resolveAgentChatOpenableFile(rawPath, cwd, roots);
    if (!openable) return;

    if (options?.isDir === true) {
      requestFileTreeReveal(openable.path, paintContextId);
      activateCenterChromeTab(paintContextId, FILES_TAB_VALUE, { placement: "focused" });
      return;
    }

    const kind = await resolveAgentChatPathKind(openable.path);
    if (kind === "directory") {
      requestFileTreeReveal(openable.path, paintContextId);
      activateCenterChromeTab(paintContextId, FILES_TAB_VALUE, { placement: "focused" });
      return;
    }
    if (kind !== "file") return;

    void openFile(openable.path, paintContextId, {
      preview: options?.preview ?? false,
      line: options?.line ?? openable.line,
    });
    activateCenterChromeTab(paintContextId, openable.path, { placement: "focused" });
  }, [
    cwd,
    openFile,
    paintContextId,
    requestFileTreeReveal,
    roots,
  ]);
}
