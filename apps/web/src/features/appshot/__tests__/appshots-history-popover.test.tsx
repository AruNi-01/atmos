// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Window } from "happy-dom";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type {
  AppshotCopyResponse,
  AppshotPermissionState,
  AppshotRecordDetail,
  AppshotRecordListItem,
  AppshotSnapshotView,
  AppshotStatus,
} from "../types";

type TestButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "size"
> & {
  size?: string;
  variant?: string;
};

type TestSpanProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: string;
};

type TestDivProps = React.HTMLAttributes<HTMLDivElement> & {
  scrollbarGutter?: boolean;
};

type TestTextShimmerProps = {
  as?: "span" | "p" | "div";
  children?: React.ReactNode;
  className?: string;
  duration?: number;
  spread?: number;
  style?: React.CSSProperties;
};

const calls = {
  copy: [] as string[],
  delete: [] as string[],
  list: 0,
  read: [] as string[][],
  readSnapshot: [] as string[],
  showPermissions: 0,
};

let recordItems: AppshotRecordListItem[] = [];
let recordDetails = new Map<string, AppshotRecordDetail>();
let deniedPermissions: AppshotPermissionState[] = [];

mock.module("@workspace/ui", () => ({
  Badge: ({ children, variant, ...props }: TestSpanProps) => {
    void variant;
    return <span {...props}>{children}</span>;
  },
  Button: ({
    children,
    size,
    variant,
    ...props
  }: TestButtonProps) => {
    void size;
    void variant;
    return <button {...props}>{children}</button>;
  },
  ScrollArea: ({
    children,
    scrollbarGutter,
    ...props
  }: TestDivProps) => {
    void scrollbarGutter;
    return <div {...props}>{children}</div>;
  },
  Skeleton: (props: React.HTMLAttributes<HTMLDivElement>) => (
    <div data-testid="appshot-history-skeleton" {...props} />
  ),
  TextShimmer: ({
    as = "span",
    children,
    className,
    duration,
    spread,
    style,
  }: TestTextShimmerProps) => {
    void duration;
    void spread;
    const props = { className, style };
    if (as === "p") {
      return <p {...props}>{children}</p>;
    }
    if (as === "div") {
      return <div {...props}>{children}</div>;
    }
    return <span {...props}>{children}</span>;
  },
  cn: (...values: Array<string | false | null | undefined>) =>
    values.filter(Boolean).join(" "),
  getFileIconProps: ({
    className,
  }: {
    className?: string;
    isDir: boolean;
    name: string;
  }) => ({
    alt: "",
    className,
    src: "/icons/file.svg",
  }),
}));

mock.module("../lib/appshot-client", () => ({
  copyAppshotRecord: async (timestamp: string): Promise<AppshotCopyResponse> => {
    calls.copy.push(timestamp);
    return {
      timestamp,
      protocol_text: `atmos://appshots/${timestamp}`,
      copied: true,
    };
  },
  deleteAppshotRecord: async (timestamp: string): Promise<void> => {
    calls.delete.push(timestamp);
  },
  getAppshotStatus: async (): Promise<AppshotStatus> => desktopStatus,
  getDeniedAppshotPermissions: () => deniedPermissions,
  listAppshotRecords: async (): Promise<AppshotRecordListItem[]> => {
    calls.list += 1;
    return recordItems;
  },
  readAppshotRecords: async (
    timestamps: string[],
  ): Promise<AppshotRecordDetail[]> => {
    calls.read.push(timestamps);
    return timestamps.map((timestamp) => {
      const detail = recordDetails.get(timestamp);
      if (!detail) {
        throw new Error(`Missing Appshot detail for ${timestamp}`);
      }
      return detail;
    });
  },
  readAppshotSnapshot: async (
    timestamp: string,
  ): Promise<AppshotSnapshotView> => {
    calls.readSnapshot.push(timestamp);
    return {
      timestamp,
      snapshot_url: `data:image/png;base64,full-${timestamp}`,
    };
  },
  showAppshotPermissionsWindow: async (): Promise<void> => {
    calls.showPermissions += 1;
  },
  watchAppshotStatusAfterPermissionOpen: () => () => undefined,
}));

const { AppshotsHistoryPopover } = await import(
  "../components/AppshotsHistoryPopover"
);

const desktopStatus: AppshotStatus = {
  supported: true,
  platform: "macos",
  reason: null,
  trigger: {
    mode: "macos_modifier_gesture",
    enabled: true,
    required_modifiers: ["fn", "option", "command"],
    last_error: null,
    permissions: [],
  },
  permissions: [],
};

let root: Root | null = null;

beforeEach(() => {
  installDom();
  calls.copy = [];
  calls.delete = [];
  calls.list = 0;
  calls.read = [];
  calls.readSnapshot = [];
  calls.showPermissions = 0;
  recordItems = [];
  recordDetails = new Map();
  deniedPermissions = [];
});

afterEach(async () => {
  if (root) {
    const currentRoot = root;
    root = null;
    await act(async () => {
      currentRoot.unmount();
    });
  }
  cleanupDom();
});

describe("S7/S8 - Header Appshots history", () => {
  it("loads only the first 10 record details, pages more, copies, and deletes rows", async () => {
    seedRecords(12);
    const container = await renderHistoryPopover();

    await flushUntil(() => uniqueReadTimestamps().length === 10);

    const newestFirst = timestamps().toReversed();
    expect(calls.list).toBe(1);
    expect(uniqueReadTimestamps()).toEqual(newestFirst.slice(0, 10));
    expect(container.textContent).toContain("App #11");
    expect(container.textContent).toContain("App #02");
    expect(container.textContent).not.toContain("App #01");
    expect(container.textContent).not.toContain("App #00");

    const recordsScrollArea = container.querySelector(
      '[aria-label="Recent Appshot records"]',
    );
    expect(recordsScrollArea?.className).toContain("h-[min(42vh,360px)]");
    expect(recordsScrollArea?.className).toContain("min-h-[160px]");

    const readCallCountBeforeMore = calls.read.length;
    await click(getButtonByText(container, "More"));
    await flushUntil(() => uniqueReadTimestamps().length === 12);

    expect(calls.read.length).toBeGreaterThan(readCallCountBeforeMore);
    expect(uniqueReadTimestamps()).toEqual(newestFirst);
    expect(container.textContent).toContain("App #01");
    expect(container.textContent).toContain("App #00");

    await click(getButtonsByLabel(container, "Copy Appshot reference")[0]);
    await flushUntil(
      () => getButtonsByLabel(container, "Copied Appshot reference").length > 0,
    );

    expect(calls.copy).toEqual([newestFirst[0]]);

    await click(getButtonsByLabel(container, "Preview screenshot for App #11 - Window #11")[0]);
    await flushUntil(() => calls.readSnapshot.length === 1);

    expect(calls.readSnapshot).toEqual([newestFirst[0]]);

    await click(getButtonsByLabel(container, "Delete Appshot record")[0]);
    await flushUntil(() => !container.textContent?.includes("App #11"));

    expect(calls.delete).toEqual([newestFirst[0]]);
    expect(container.textContent).not.toContain("App #11");
    expect(container.textContent).toContain("App #10");
  });

  it("shows one permission CTA that opens the dedicated Appshots window", async () => {
    deniedPermissions = [
      makeDeniedPermission("accessibility", "Accessibility"),
      makeDeniedPermission("screen_recording", "Screen Recording"),
    ];

    const container = await renderHistoryPopover();
    await flushUntil(() => container.textContent?.includes("Permissions required") ?? false);

    expect(getButtonsByText(container, "Enable")).toHaveLength(1);
    expect(container.textContent).not.toContain("Grant");

    await click(getButtonByText(container, "Enable"));

    expect(calls.showPermissions).toBe(1);
  });
});

async function renderHistoryPopover(): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<AppshotsHistoryPopover open />);
  });

  return container;
}

function seedRecords(count: number): void {
  const items: AppshotRecordListItem[] = [];
  const details = new Map<string, AppshotRecordDetail>();

  for (let index = 0; index < count; index += 1) {
    const timestamp = timestampAt(index);
    items.push({
      timestamp,
      record_dir: `~/.atmos/appshots/records/${timestamp}`,
    });
    details.set(timestamp, makeRecordDetail(timestamp, index));
  }

  recordItems = items;
  recordDetails = details;
}

function timestamps(): string[] {
  return recordItems.map((item) => item.timestamp);
}

function uniqueReadTimestamps(): string[] {
  return Array.from(new Set(calls.read.flat()));
}

function timestampAt(index: number): string {
  return String(1_760_000_000_000 + index);
}

function makeRecordDetail(
  timestamp: string,
  index: number,
): AppshotRecordDetail {
  const label = index.toString().padStart(2, "0");

  return {
    timestamp,
    context_preview: `Context preview for App #${label}. This text is intentionally long enough to exercise row rendering.`,
    snapshot_url: `data:image/png;base64,snapshot-${label}`,
    metadata: {
      timestamp,
      captured_at: new Date(Number(timestamp)).toISOString(),
      platform: "macos",
      app_name: `App #${label}`,
      bundle_id: `land.atmos.test.${label}`,
      process_id: 10_000 + index,
      window_title: `Window #${label}`,
      window_id: `window-${label}`,
      quality: "screenshot_and_accessibility",
      record_dir: `~/.atmos/appshots/records/${timestamp}`,
      snapshot_path: `~/.atmos/appshots/records/${timestamp}/snapshot.png`,
      context_path: `~/.atmos/appshots/records/${timestamp}/context.md`,
      metadata_path: `~/.atmos/appshots/records/${timestamp}/metadata.json`,
      screenshot: {
        available: true,
        width: 1280,
        height: 720,
        media_type: "image/png",
      },
      warnings: [],
      context_bytes: 128,
    },
  };
}

function makeDeniedPermission(
  name: AppshotPermissionState["name"],
  displayName: string,
): AppshotPermissionState {
  return {
    name,
    display_name: displayName,
    granted: false,
    required_for: ["Required for Appshots"],
    recovery_action: {
      label: "Grant",
      target: name,
      manual_steps: [],
    },
  };
}

async function click(element: Element | undefined): Promise<void> {
  if (!element) {
    throw new Error("Expected element to click");
  }

  await act(async () => {
    element.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  });
}

function getButtonsByLabel(container: HTMLElement, label: string): HTMLButtonElement[] {
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>(
      `button[aria-label="${label}"]`,
    ),
  );
}

function getButtonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === text,
  );
  if (!button) {
    throw new Error(`Button not found: ${text}`);
  }
  return button;
}

function getButtonsByText(container: HTMLElement, text: string): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll("button")).filter(
    (candidate) => candidate.textContent?.trim() === text,
  );
}

async function flushUntil(
  predicate: () => boolean,
  timeoutMs = 2_000,
): Promise<void> {
  const startedAt = Date.now();
  while (!predicate() && Date.now() - startedAt < timeoutMs) {
    await act(async () => {
      await Promise.resolve();
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    });
  }
  expect(predicate()).toBe(true);
}

function installDom(): void {
  const browserWindow = new Window({ url: "http://localhost:3030" });
  const win = browserWindow as unknown as Window &
    typeof globalThis & {
      ResizeObserver?: typeof ResizeObserver;
    };

  const requestAnimationFrame = (callback: FrameRequestCallback): number =>
    win.setTimeout(() => callback(Date.now()), 0) as unknown as number;
  const cancelAnimationFrame = (handle: number): void => {
    win.clearTimeout(handle);
  };

  setGlobal("window", win);
  setGlobal("document", win.document);
  setGlobal("navigator", win.navigator);
  setGlobal("HTMLElement", win.HTMLElement);
  setGlobal("HTMLButtonElement", win.HTMLButtonElement);
  setGlobal("Element", win.Element);
  setGlobal("Node", win.Node);
  setGlobal("Text", win.Text);
  setGlobal("Event", win.Event);
  setGlobal("MouseEvent", win.MouseEvent);
  setGlobal("MutationObserver", win.MutationObserver);
  setGlobal("ResizeObserver", win.ResizeObserver);
  setGlobal("getComputedStyle", win.getComputedStyle.bind(win));
  setGlobal("requestAnimationFrame", requestAnimationFrame);
  setGlobal("cancelAnimationFrame", cancelAnimationFrame);
  setGlobal("IS_REACT_ACT_ENVIRONMENT", true);

  Object.defineProperty(win, "requestAnimationFrame", {
    configurable: true,
    value: requestAnimationFrame,
    writable: true,
  });
  Object.defineProperty(win, "cancelAnimationFrame", {
    configurable: true,
    value: cancelAnimationFrame,
    writable: true,
  });
  win.SyntaxError = SyntaxError;
}

function cleanupDom(): void {
  for (const key of [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "HTMLButtonElement",
    "Element",
    "Node",
    "Text",
    "Event",
    "MouseEvent",
    "MutationObserver",
    "ResizeObserver",
    "getComputedStyle",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "IS_REACT_ACT_ENVIRONMENT",
  ]) {
    Reflect.deleteProperty(globalThis, key);
  }
}

function setGlobal(key: string, value: unknown): void {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value,
    writable: true,
  });
}
