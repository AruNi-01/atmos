import { expect, spyOn, test } from "bun:test";
import { Window } from "happy-dom";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { agentStatusApi } from "@/api/rest-api";
import { useAgentStatusStore } from "@/features/agent/store/agent-status-store";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { resetCachedDynamicTitlesForTests } from "@/features/terminal/lib/terminal-dynamic-title-cache";
import { applyServerTerminalTitle } from "@/features/terminal/lib/terminal-server-title";
import { useTerminalStore } from "@/features/terminal/store/use-terminal-store";
import { WebSocketProvider } from "./websocket-provider";

const noop = () => {};
const router = {
  back: noop,
  forward: noop,
  refresh: noop,
  push: noop,
  replace: noop,
  prefetch: noop,
  bfcacheId: "test",
};

test("terminal title changes leave a running Agent active until its status event ends the turn", async () => {
  const dom = new Window({ url: "http://localhost/tok" });
  const globals = { window: dom, document: dom.document, IS_REACT_ACT_ENVIRONMENT: true };
  const originalGlobals = Object.fromEntries(
    Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  Object.assign(globalThis, globals);
  const fetchMock = spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({}));
  const removeSession = spyOn(agentStatusApi, "removeSession").mockResolvedValue({ ok: true });
  const root = createRoot(dom.document.createElement("div") as unknown as HTMLElement);
  const pane = {
    id: "pane",
    label: "1",
    sessionId: "terminal-session",
    workspaceId: "ws-1",
    tmuxWindowName: "1",
    dynamicTitle: "claude",
  };
  const status = {
    session_id: "ws-1:1",
    pane_id: "ws-1:1",
    tool: "claude-code",
    state: "running",
    timestamp: "2026-11-20T00:00:00Z",
  };
  const emitStatus = (event: string, payload: unknown) => {
    const listeners = useWebSocketStore.getState().eventListeners.get(event);
    expect(listeners?.size).toBeGreaterThan(0);
    listeners?.forEach((callback) => callback(payload));
  };
  const currentState = () => useAgentStatusStore.getState().sessions.get(status.session_id)?.state;

  try {
    useTerminalStore.setState({ workspacePanes: { "ws-1": { pane } } });
    useAgentStatusStore.getState().init();
    await act(async () => {
      root.render(
        <PathnameContext.Provider value="/tok">
          <AppRouterContext.Provider value={router}>
            <NextIntlClientProvider locale="en" timeZone="UTC" messages={{}}>
              <WebSocketProvider>{null}</WebSocketProvider>
            </NextIntlClientProvider>
          </AppRouterContext.Provider>
        </PathnameContext.Provider>,
      );
    });

    emitStatus("agent_status_changed", status);
    expect(currentState()).toBe("running");
    applyServerTerminalTitle({
      workspace_id: pane.workspaceId,
      tmux_window_name: pane.tmuxWindowName,
      session_id: pane.sessionId,
      dynamic_title: "git status",
    });
    expect(useTerminalStore.getState().workspacePanes["ws-1"]?.pane?.dynamicTitle).toBe(
      "git status",
    );
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    expect(currentState()).toBe("running");
    expect(removeSession).not.toHaveBeenCalled();

    emitStatus("agent_status_changed", { ...status, state: "idle" });
    expect(currentState()).toBe("idle");
    emitStatus("agent_status_cleared", { session_ids: [status.session_id] });
    expect(currentState()).toBeUndefined();
  } finally {
    await act(async () => root.unmount());
    useAgentStatusStore.getState().cleanup();
    useTerminalStore.setState(useTerminalStore.getInitialState(), true);
    resetCachedDynamicTitlesForTests();
    removeSession.mockRestore();
    fetchMock.mockRestore();
    for (const [key, descriptor] of Object.entries(originalGlobals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    await dom.close();
  }
});
