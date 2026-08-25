import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_CENTER_SPACE_ID,
} from "@/app-shell/center-space/center-space";
import { FIXED_TERMINAL_TAB_VALUE } from "@/features/terminal/lib/terminal-layout-document";
import {
  applyResourceLocateArrival,
  shouldArriveResourceLocate,
  shouldShowResourceLocateRing,
  type LiveResourceSessionLocation,
} from "@/features/terminal/public/pane-location";

const dir = import.meta.dir;

function readSibling(name: string): string {
  return readFileSync(join(dir, "..", name), "utf8");
}

const target: LiveResourceSessionLocation = {
  hostId: "ws-1",
  spaceId: DEFAULT_CENTER_SPACE_ID,
  paintContextId: "ws-1",
  terminalTabId: FIXED_TERMINAL_TAB_VALUE,
  paneId: "pane-1",
  sessionId: "sess-1",
  tmuxWindowName: "1",
};

const candidate = {
  hostId: "ws-1",
  paintContextId: "ws-1",
  terminalTabId: FIXED_TERMINAL_TAB_VALUE,
  paneId: "pane-1",
  sessionId: "sess-1",
  tmuxWindowName: "1",
};

describe("resource locate pane helpers", () => {
  it("arrives only when the matching pane is on the active surface", () => {
    expect(
      shouldArriveResourceLocate({
        surfaceActive: true,
        phase: "pending",
        target,
        candidate,
      }),
    ).toBe(true);
    expect(
      shouldArriveResourceLocate({
        surfaceActive: false,
        phase: "pending",
        target,
        candidate,
      }),
    ).toBe(false);
  });

  it("does not arrive for host, paint, tab, pane, session, or tmux mismatches", () => {
    const pending = { surfaceActive: true, phase: "pending" as const, target };
    expect(
      shouldArriveResourceLocate({
        ...pending,
        candidate: { ...candidate, hostId: "other" },
      }),
    ).toBe(false);
    expect(
      shouldArriveResourceLocate({
        ...pending,
        candidate: { ...candidate, paintContextId: "ws-1::space::space-abc" },
      }),
    ).toBe(false);
    expect(
      shouldArriveResourceLocate({
        ...pending,
        candidate: { ...candidate, terminalTabId: "terminal-tab:other" },
      }),
    ).toBe(false);
    expect(
      shouldArriveResourceLocate({
        ...pending,
        candidate: { ...candidate, paneId: "pane-2" },
      }),
    ).toBe(false);
    expect(
      shouldArriveResourceLocate({
        ...pending,
        candidate: { ...candidate, sessionId: "sess-other" },
      }),
    ).toBe(false);
    expect(
      shouldArriveResourceLocate({
        ...pending,
        candidate: { ...candidate, tmuxWindowName: "2" },
      }),
    ).toBe(false);
  });

  it("shows the ring only during the active matching phase", () => {
    expect(
      shouldShowResourceLocateRing({ phase: "pending", target, candidate }),
    ).toBe(false);
    expect(
      shouldShowResourceLocateRing({ phase: "active", target, candidate }),
    ).toBe(true);
    expect(
      shouldShowResourceLocateRing({
        phase: "active",
        target,
        candidate: { ...candidate, paneId: "pane-2" },
      }),
    ).toBe(false);
  });

  it("focuses after setActivePaneId and arrives without waiting for the scheduled focus", () => {
    const order: string[] = [];
    const scheduled: Array<() => void> = [];
    applyResourceLocateArrival({
      paneId: "pane-1",
      generation: 4,
      setActivePaneId: (id) => {
        order.push(`active:${id}`);
      },
      scheduleFocus: (run) => {
        order.push("schedule");
        scheduled.push(run);
      },
      focusPane: () => {
        order.push("focus");
      },
      arrive: (generation) => {
        order.push(`arrive:${generation}`);
      },
    });
    expect(order).toEqual(["active:pane-1", "schedule", "arrive:4"]);
    scheduled[0]!();
    expect(order).toEqual(["active:pane-1", "schedule", "arrive:4", "focus"]);
  });
});

describe("resource locate pane wiring", () => {
  it("subscribes to the locate store and applies the ring only in the active phase", () => {
    const pane = readSibling("TerminalWorkspacePane.tsx");
    expect(pane).toContain("useTerminalPaneLocateStore");
    expect(pane).toContain("shouldArriveResourceLocate");
    expect(pane).toContain("shouldShowResourceLocateRing");
    expect(pane).toContain("applyResourceLocateArrival");
    expect(pane).toContain("requestAnimationFrame");
    expect(pane).toContain("resource-locate-ring");
    expect(pane).toContain("data-resource-locate-ring");
    expect(pane).toContain("surfaceActive");
    expect(pane).not.toContain("useAgentAttentionStore.getState().raise");
    expect(pane).toContain("useTerminalPaneLocateStore.getState().arrive");
    expect(pane).not.toContain("useAgentAttentionStore.getState().arrive");
  });

  it("keeps locate CSS after attention and uses a one-shot semantic info pulse", () => {
    const css = readSibling("terminal-grid.css");
    const attentionAfter = css.indexOf(
      ".terminal-split-theme .terminal-pane.agent-attention-ring::after",
    );
    const locateAfter = css.indexOf(
      ".terminal-split-theme .terminal-pane.resource-locate-ring::after",
    );
    const locateKeyframes = css.indexOf("@keyframes resource-locate-pane-border-pulse");
    const reducedMotion = css.indexOf("@media (prefers-reduced-motion: reduce)");
    expect(attentionAfter).toBeGreaterThan(0);
    expect(locateAfter).toBeGreaterThan(attentionAfter);
    expect(locateKeyframes).toBeGreaterThan(attentionAfter);
    expect(css).toContain("var(--info)");
    expect(css).toContain("2400ms ease-out forwards");
    expect(css).not.toMatch(
      /\.terminal-pane\.resource-locate-ring::after[\s\S]{0,400}box-shadow/,
    );
    expect(css).not.toMatch(
      /\.resource-locate-ring[\s\S]{0,400}transform:\s*scale/,
    );
    expect(css.slice(locateAfter, locateAfter + 500)).not.toContain("infinite");
    expect(css).toContain("agent-attention-pane-border-pulse 2.4s ease-in-out infinite");
    expect(reducedMotion).toBeGreaterThan(locateAfter);
    const reducedBlock = css.slice(reducedMotion, reducedMotion + 280);
    expect(reducedBlock).toContain("resource-locate-ring::after");
    expect(reducedBlock).toContain("animation: none");
    expect(reducedBlock).toContain("var(--info)");
    expect(css).toContain(".terminal-pane.agent-attention-ring::after");
    expect(css).toContain(".terminal-pane.resource-locate-ring::after");
  });
});
