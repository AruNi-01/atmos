// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { beforeEach, describe, expect, it } from "bun:test";
import { makeCenterSpaceKey } from "@/app-shell/center-space/center-space";
import {
  bindCenterPaintTabUrlWriter,
  bindPaintContextIdReader,
  paintContextIdForHost,
  shouldHonorUrlTabForPaintContext,
  shouldKeepExplicitTabOnHostHop,
  syncPaintContextTabUrl,
  tabValueBelongsToPaintContext,
} from "@/app-shell/center-space/center-space-url";
import { setCenterStageLastTab } from "@/shared/stores/use-ui-pref-hooks";

function githubPrTab(contextId: string, pr: number): string {
  return `github-pr:${encodeURIComponent(contextId)}:${pr}`;
}

function browserTab(contextId: string, browserId: string): string {
  return `browser:${encodeURIComponent(contextId)}:${browserId}`;
}

describe("center space URL isolation", () => {
  beforeEach(() => {
    bindCenterPaintTabUrlWriter(null);
    bindPaintContextIdReader(null);
  });

  it("treats leftover same-tab hops as inherited", () => {
    expect(
      shouldKeepExplicitTabOnHostHop({
        destHostId: "ws-b",
        destPaintId: "ws-b",
        dest: {
          contextId: "ws-b",
          tabParam: "files",
          hasTabParam: true,
          terminalTmux: null,
          sideChat: null,
        },
        current: {
          contextId: "ws-a",
          tabParam: "files",
          hasTabParam: true,
          terminalTmux: null,
          sideChat: null,
        },
      }),
    ).toBe(false);
  });

  it("keeps agent deep links and dest-owned github/browser tabs", () => {
    const extra = makeCenterSpaceKey("ws-b", "space-2");
    expect(
      shouldKeepExplicitTabOnHostHop({
        destHostId: "ws-b",
        destPaintId: extra,
        dest: {
          contextId: "ws-b",
          tabParam: "terminal",
          hasTabParam: true,
          terminalTmux: "agent-1",
          sideChat: null,
        },
        current: {
          contextId: "ws-a",
          tabParam: "files",
          hasTabParam: true,
          terminalTmux: null,
          sideChat: null,
        },
      }),
    ).toBe(true);
    expect(tabValueBelongsToPaintContext(githubPrTab("ws-b", 12), "ws-b")).toBe(true);
    expect(tabValueBelongsToPaintContext(githubPrTab("ws-b", 12), extra)).toBe(false);
    expect(tabValueBelongsToPaintContext(githubPrTab(extra, 4), extra)).toBe(true);
    expect(tabValueBelongsToPaintContext(browserTab("ws-b", "browser-1"), "ws-b")).toBe(
      true,
    );
  });

  it("does not keep a copied leftover tmux/tab pair on a different host", () => {
    expect(
      shouldKeepExplicitTabOnHostHop({
        destHostId: "ws-b",
        destPaintId: "ws-b",
        dest: {
          contextId: "ws-b",
          tabParam: "files",
          hasTabParam: true,
          terminalTmux: "stale",
          sideChat: "chat-1",
        },
        current: {
          contextId: "ws-a",
          tabParam: "files",
          hasTabParam: true,
          terminalTmux: "stale",
          sideChat: "chat-1",
        },
      }),
    ).toBe(false);
  });

  it("keeps an explicit dest tab that differs from the current host tab", () => {
    expect(
      shouldKeepExplicitTabOnHostHop({
        destHostId: "ws-b",
        destPaintId: "ws-b",
        dest: {
          contextId: "ws-b",
          tabParam: "changes",
          hasTabParam: true,
          terminalTmux: null,
          sideChat: null,
        },
        current: {
          contextId: "ws-a",
          tabParam: "files",
          hasTabParam: true,
          terminalTmux: null,
          sideChat: null,
        },
      }),
    ).toBe(true);
  });

  it("does not honor leftover tool tabs after a paint-context change", () => {
    expect(
      shouldHonorUrlTabForPaintContext({
        tabFromUrl: "files",
        paintId: "ws-b",
        previousPaintId: "ws-a",
        lastTab: "terminal",
      }),
    ).toBe(false);
    expect(
      shouldHonorUrlTabForPaintContext({
        tabFromUrl: "files",
        paintId: "ws-b",
        previousPaintId: "ws-b",
        lastTab: "terminal",
        blockedUrlTab: "files",
      }),
    ).toBe(false);
    expect(
      shouldHonorUrlTabForPaintContext({
        tabFromUrl: "files",
        paintId: makeCenterSpaceKey("ws-a", "space-2"),
        previousPaintId: "ws-a",
        lastTab: "changes",
      }),
    ).toBe(false);
  });

  it("honors dest last tab, same-paint clicks, and dest-owned github tabs", () => {
    const extra = makeCenterSpaceKey("ws-b", "space-2");
    expect(
      shouldHonorUrlTabForPaintContext({
        tabFromUrl: "changes",
        paintId: extra,
        previousPaintId: "ws-b",
        lastTab: "changes",
      }),
    ).toBe(true);
    expect(
      shouldHonorUrlTabForPaintContext({
        tabFromUrl: "files",
        paintId: extra,
        previousPaintId: extra,
        lastTab: "changes",
      }),
    ).toBe(true);
    expect(
      shouldHonorUrlTabForPaintContext({
        tabFromUrl: githubPrTab(extra, 9),
        paintId: extra,
        previousPaintId: "ws-a",
        lastTab: "terminal",
      }),
    ).toBe(true);
    expect(
      shouldHonorUrlTabForPaintContext({
        tabFromUrl: githubPrTab("ws-a", 9),
        paintId: extra,
        previousPaintId: extra,
        lastTab: "terminal",
      }),
    ).toBe(false);
  });

  it("treats leftover terminalTmux as foreign on a host hop", () => {
    expect(
      shouldHonorUrlTabForPaintContext({
        tabFromUrl: "terminal",
        paintId: "ws-b",
        previousPaintId: "ws-a",
        lastTab: "files",
        terminalTmux: "agent-1",
        previousTerminalTmux: "agent-1",
      }),
    ).toBe(false);
    expect(
      shouldHonorUrlTabForPaintContext({
        tabFromUrl: "terminal",
        paintId: "ws-b",
        previousPaintId: "ws-a",
        lastTab: "files",
        terminalTmux: "agent-2",
        previousTerminalTmux: "agent-1",
      }),
    ).toBe(true);
    expect(
      shouldHonorUrlTabForPaintContext({
        tabFromUrl: "terminal",
        paintId: "ws-b",
        previousPaintId: "ws-b",
        lastTab: "files",
        terminalTmux: "agent-1",
        previousTerminalTmux: "agent-1",
        ignoreLeftoverDeepLink: true,
      }),
    ).toBe(false);
  });

  it("resolves dest paint id through the bound reader", () => {
    const extra = makeCenterSpaceKey("ws-paint-url", "space-files");
    bindPaintContextIdReader((hostId) =>
      hostId === "ws-paint-url" ? extra : hostId,
    );
    expect(paintContextIdForHost("ws-paint-url")).toBe(extra);
    expect(paintContextIdForHost("ws-other")).toBe("ws-other");
    bindPaintContextIdReader(null);
  });

  it("syncPaintContextTabUrl clears leftover deep-link tab", () => {
    const extra = makeCenterSpaceKey("ws-sync-url", "space-2");
    setCenterStageLastTab(extra, "changes");
    const writes: Array<string | null> = [];
    bindCenterPaintTabUrlWriter((patch) => {
      writes.push(patch.tab);
    });
    syncPaintContextTabUrl(extra);
    expect(writes).toEqual([null]);
    bindCenterPaintTabUrlWriter(null);
  });
});
