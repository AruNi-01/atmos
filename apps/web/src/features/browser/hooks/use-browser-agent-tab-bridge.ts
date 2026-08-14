"use client";

import { useEffect } from "react";

import {
  invokeDesktopBrowserBridge,
  listenDesktopBrowserBridge,
} from "@/shared/lib/desktop-browser-bridge";
import { isDesktopRuntime } from "@/shared/lib/desktop-runtime";

import { useBrowserSessionMapStore } from "../store/use-browser-session-map";
import { useBrowserTabCommandsStore } from "../store/use-browser-tab-commands";

type AgentTabPayload = {
  requestId?: string;
  tabAction?: string;
  url?: string;
  targetId?: string;
};

let listening = false;
let listenStarted = false;

function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      if (predicate()) {
        resolve(true);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        resolve(false);
        return;
      }
      window.setTimeout(tick, 50);
    };
    tick();
  });
}

async function ackAgentTab(result: {
  requestId: string;
  ok: boolean;
  target_id?: string | null;
  tab_id?: string | null;
  error?: string;
  error_code?: string;
}): Promise<void> {
  await invokeDesktopBrowserBridge("browser_bridge_agent_tab_result", result);
}

async function handleAgentTab(payload: AgentTabPayload): Promise<void> {
  const requestId = payload.requestId?.trim();
  if (!requestId) return;
  const action = (payload.tabAction || "").trim();
  const map = useBrowserSessionMapStore.getState();
  const commands = useBrowserTabCommandsStore.getState();

  try {
    if (action === "open") {
      const url = payload.url?.trim() ?? "";
      if (!url) {
        await ackAgentTab({
          requestId,
          ok: false,
          error: "tabs open requires url",
          error_code: "invalid_args",
        });
        return;
      }
      const contextId = map.pickContext(payload.targetId);
      if (!contextId) {
        await ackAgentTab({
          requestId,
          ok: false,
          error: "no Atmos Browser panel is mounted; open a Browser tab first",
          error_code: "embedded_browser_host_unavailable",
        });
        return;
      }
      const tabId = await commands.openTab(contextId, url);
      const bound = await waitFor(
        () => Boolean(useBrowserSessionMapStore.getState().sessionForTab(tabId)),
        8_000,
      );
      const sessionId = useBrowserSessionMapStore.getState().sessionForTab(tabId);
      if (!bound || !sessionId) {
        await ackAgentTab({
          requestId,
          ok: false,
          error: "tab opened but the webview did not bind",
          error_code: "browser_engine_failed",
        });
        return;
      }
      await ackAgentTab({
        requestId,
        ok: true,
        target_id: sessionId,
        tab_id: "main",
      });
      return;
    }

    if (action === "select" || action === "close") {
      const targetId = payload.targetId?.trim() ?? "";
      const binding = targetId ? map.findBySession(targetId) : null;
      if (!binding) {
        await ackAgentTab({
          requestId,
          ok: false,
          error: `unknown target_id ${targetId || "(empty)"}`,
          error_code: "invalid_args",
        });
        return;
      }
      if (action === "close") {
        const panel = map.panels[binding.contextId];
        if (panel && panel.tabCount <= 1) {
          await ackAgentTab({
            requestId,
            ok: false,
            error: "cannot close the last Browser tab",
            error_code: "invalid_args",
          });
          return;
        }
        commands.closeTab(binding.contextId, binding.tabId);
        await waitFor(
          () => !useBrowserSessionMapStore.getState().findBySession(targetId),
          3_000,
        );
      } else {
        commands.selectTab(binding.contextId, binding.tabId);
      }
      await ackAgentTab({
        requestId,
        ok: true,
        target_id: targetId,
        tab_id: "main",
      });
      return;
    }

    await ackAgentTab({
      requestId,
      ok: false,
      error: "tabs requires action list|open|close|select",
      error_code: "invalid_args",
    });
  } catch (error) {
    await ackAgentTab({
      requestId,
      ok: false,
      error: error instanceof Error ? error.message : "tab command failed",
      error_code: "browser_engine_failed",
    });
  }
}

async function ensureListener(): Promise<void> {
  if (listening || listenStarted || !isDesktopRuntime()) return;
  listenStarted = true;
  await listenDesktopBrowserBridge("desktop-browser:agent-tab", (payload) => {
    void handleAgentTab(payload as AgentTabPayload);
  });
  listening = true;
}

/** Mount once per Browser panel so agent tab events reach the React command bus. */
export function useBrowserAgentTabBridge(options: {
  contextId: string;
  isActive: boolean;
  tabCount: number;
}): void {
  const { contextId, isActive, tabCount } = options;

  useEffect(() => {
    if (!isDesktopRuntime()) return;
    const store = useBrowserSessionMapStore.getState();
    store.registerPanel(contextId, { isActive, tabCount });
    return () => {
      useBrowserSessionMapStore.getState().unregisterPanel(contextId);
    };
  }, [contextId]);

  useEffect(() => {
    if (!isDesktopRuntime()) return;
    useBrowserSessionMapStore.getState().registerPanel(contextId, { isActive, tabCount });
  }, [contextId, isActive, tabCount]);

  useEffect(() => {
    void ensureListener();
  }, []);
}
