// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Window } from "happy-dom";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ResourceProjectMetrics } from "@atmos/api-types/ws/dto/resource-monitor";
import type { LiveResourceSessionPanes } from "@/features/terminal/public";

mock.module("@workspace/ui", () => ({
  Badge: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLSpanElement> & { children?: React.ReactNode }) => (
    <span {...props}>{children}</span>
  ),
  Collapsible: ({
    children,
    defaultOpen: _defaultOpen,
    onOpenChange: _onOpenChange,
    open: _open,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & {
    children?: React.ReactNode;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    open?: boolean;
  }) => (
    <div {...props}>{children}</div>
  ),
  CollapsibleContent: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) => (
    <div {...props}>{children}</div>
  ),
  CollapsibleTrigger: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
  Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
  TooltipTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

const translate = (key: string, values?: Record<string, string | number>) => {
  if (!values) return key;
  return `${key}:${JSON.stringify(values)}`;
};

mock.module("next-intl", () => ({
  useTranslations: () => translate,
}));

mock.module("@/features/agent/components/AgentIcon", () => ({
  AgentIcon: () => <span data-agent-icon="" />,
}));

const spaceState: {
  byHost: Record<string, { spaces: Array<{ id: string; name: string }> }>;
} = { byHost: {} };

mock.module("@/app-shell/center-space/center-space-store", () => ({
  useCenterSpaceStore: (
    selector: (state: typeof spaceState) => unknown,
  ) => selector(spaceState),
}));

const { ResourceMonitorHierarchy } = await import(
  "@/features/resource-monitor/components/ResourceMonitorHierarchy"
);

const USAGE = {
  cpu_percent: 7.3,
  memory_rss_bytes: 291_000_000,
  process_count: 2,
};
const PROJECT_ID = "proj-1";
const SESSION_ID = "sess-grok";

const project: ResourceProjectMetrics = {
  project_id: PROJECT_ID,
  name: "Atmos",
  usage: USAGE,
  direct_usage: USAGE,
  workspaces: [],
  sessions: [
    {
      session_id: SESSION_ID,
      name: "Grok Build",
      terminal_kind: "tmux",
      usage: USAGE,
      processes: [
        {
          name: "node",
          usage: {
            cpu_percent: 1.1,
            memory_rss_bytes: 20_000_000,
            process_count: 1,
          },
          ports: [],
        },
      ],
    },
  ],
  other_usage: { cpu_percent: 0, memory_rss_bytes: 0, process_count: 0 },
  other_processes: [],
};

const workspacePanes: LiveResourceSessionPanes = {
  [PROJECT_ID]: {
    "pane-1": {
      sessionId: SESSION_ID,
      workspaceId: PROJECT_ID,
      tmuxWindowName: "1",
    },
  },
};

function renderHierarchy(
  root: Root | null,
  panes: LiveResourceSessionPanes,
) {
  root?.render(
    <ResourceMonitorHierarchy
      sortKey="name"
      sortDirection="ascending"
      onSortKeyChange={() => undefined}
      snapshotProjects={[project]}
      snapshotServer={USAGE}
      snapshotShared={USAGE}
      snapshotDesktopUse={{
        cpu_percent: 0,
        memory_rss_bytes: 0,
        process_count: 0,
      }}
      snapshotUnattributed={{
        cpu_percent: 0,
        memory_rss_bytes: 0,
        process_count: 0,
      }}
      showUnattributed={false}
      showProjectsEmpty={false}
      showDesktop={false}
      desktopLoading={false}
      liveDisplays={new Map()}
      workspacePanes={panes}
      onNavigate={() => undefined}
    />,
  );
}

describe("ResourceMonitorHierarchy session row hover", () => {
  let root: Root | null = null;
  let container: HTMLElement;

  beforeEach(() => {
    spaceState.byHost = {};
    const window = new Window({ url: "http://localhost/" });
    globalThis.window = window as unknown as typeof globalThis.window;
    globalThis.document = window.document as unknown as Document;
    globalThis.HTMLElement = window.HTMLElement as unknown as typeof HTMLElement;
    container = globalThis.document.createElement("div");
    globalThis.document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
  });

  it("keeps the chevron on one padded hover surface without a locate icon", async () => {
    const onNavigate = mock(() => undefined);

    await act(async () => {
      root?.render(
        <ResourceMonitorHierarchy
          sortKey="name"
          sortDirection="ascending"
          onSortKeyChange={() => undefined}
          snapshotProjects={[project]}
          snapshotServer={USAGE}
          snapshotShared={USAGE}
          snapshotDesktopUse={{
            cpu_percent: 0,
            memory_rss_bytes: 0,
            process_count: 0,
          }}
          snapshotUnattributed={{
            cpu_percent: 0,
            memory_rss_bytes: 0,
            process_count: 0,
          }}
          showUnattributed={false}
          showProjectsEmpty={false}
          showDesktop={false}
          desktopLoading={false}
          liveDisplays={new Map()}
          workspacePanes={workspacePanes}
          onNavigate={onNavigate}
        />,
      );
    });

    const session = container.querySelector(
      `[data-resource-monitor-session][data-session-id="${SESSION_ID}"]`,
    );
    expect(session).not.toBeNull();
    const row = session?.querySelector(
      "[data-resource-monitor-session-row]",
    ) as HTMLElement | null;
    expect(row).not.toBeNull();
    expect(row?.className).toContain("hover:bg-accent");
    expect(row?.className).toContain("px-2");
    expect(row?.className).toContain("mx-2");
    expect(row?.className).toContain("rounded-md");

    const trigger = row?.querySelector(
      "[data-resource-monitor-session-trigger]",
    ) as HTMLButtonElement | null;
    expect(trigger).not.toBeNull();
    expect(trigger?.tagName).toBe("BUTTON");
    expect(row?.contains(trigger)).toBe(true);
    expect(trigger?.className).toContain("hover:text-foreground");
    expect(trigger?.className).not.toContain("hover:bg-accent");

    const locate = row?.querySelector(
      "[data-resource-monitor-session-locate]",
    ) as HTMLButtonElement | null;
    expect(locate).not.toBeNull();
    expect(session?.querySelector("svg.lucide-locate")).toBeNull();
    expect(session?.innerHTML).not.toContain("lucide-locate");
    expect(session?.querySelector("[data-resource-monitor-space-badge]")).toBeNull();

    await act(async () => {
      trigger?.dispatchEvent(
        new globalThis.window.Event("click", { bubbles: true }),
      );
    });
    expect(onNavigate).not.toHaveBeenCalled();

    await act(async () => {
      locate?.dispatchEvent(
        new globalThis.window.Event("click", { bubbles: true }),
      );
    });
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("shows a Space badge only when the host has more than one Space", async () => {
    spaceState.byHost[PROJECT_ID] = {
      spaces: [
        { id: "main", name: "Default" },
        { id: "space-review", name: "Review" },
      ],
    };
    const extraPanes: LiveResourceSessionPanes = {
      [`${PROJECT_ID}::space::space-review`]: {
        "pane-1": {
          sessionId: SESSION_ID,
          workspaceId: PROJECT_ID,
          tmuxWindowName: "cs__space-review__1",
        },
      },
    };

    await act(async () => {
      renderHierarchy(root, extraPanes);
    });

    const badge = container.querySelector(
      '[data-resource-monitor-space-badge="space-review"]',
    );
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain("Review");
    expect(badge?.getAttribute("aria-label")).toContain("Review");

    spaceState.byHost[PROJECT_ID] = {
      spaces: [{ id: "main", name: "Default" }],
    };
    await act(async () => {
      renderHierarchy(root, extraPanes);
    });
    expect(
      container.querySelector("[data-resource-monitor-space-badge]"),
    ).toBeNull();
  });
});
