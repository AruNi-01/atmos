// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Window } from "happy-dom";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { LocalService } from "@/features/local-services/types";

mock.module("@workspace/ui", () => ({
  cn: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(" "),
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => (
    <button {...props}>{children}</button>
  ),
  Popover: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Skeleton: (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />,
  Tooltip: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children?: React.ReactNode; asChild?: boolean }) => <>{children}</>,
  TooltipContent: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="command-tooltip">{children}</div>
  ),
}));

mock.module("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const { LocalServiceRow } = await import("../LocalServiceRow");

const command =
  "node /Users/lurunrun/.npm/_npx/cef9b194a47a5767/node_modules/.bin/agentation-mcp server";

const service: LocalService = {
  id: "svc-1",
  owner: { root_path: "/Users/lurunrun/own_space/OpenSource/atmos" },
  kind: "workspace_dev_server",
  status: "online",
  confidence: 1,
  reasons: [],
  url: "http://localhost:4747",
  display_url: "localhost:4747",
  port: 4747,
  process_name: "node",
  command_preview: command,
  launch_dir_display: "/Users/lurunrun/own_space/OpenSource/atmos",
  can_open: true,
  can_stop: true,
  protected: false,
  last_seen_at: "2026-08-25T00:00:00Z",
};

let root: Root | null = null;

describe("LocalServiceRow command meta", () => {
  beforeEach(() => {
    installDom();
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

  it("keeps process name and wraps the launch command, with tooltip instead of title", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<LocalServiceRow service={service} />);
    });

    const line = container.querySelector("[data-slot=local-service-command]");
    expect(line).toBeTruthy();
    expect(line?.getAttribute("title")).toBeNull();
    expect(line?.textContent).toContain("node (agentation-mcp server)");
    expect(line?.textContent).not.toContain(".bin");
    expect(line?.textContent).not.toContain(" · ");
    expect(container.querySelector("[data-testid=command-tooltip]")?.textContent).toBe(command);
  });

  it("keeps spaces in process titles and tooltips the original command path", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const commandPath =
      "node /Users/aarynlu/OpenSource/atmos/apps/web/node_modules/.bin/next dev --port 3030";

    await act(async () => {
      root?.render(
        <LocalServiceRow
          service={{
            ...service,
            command_preview: "next-server (v16.3.0)",
            command_path: commandPath,
            launch_dir_display: "/Users/aarynlu/OpenSource/atmos/apps/web",
          }}
        />,
      );
    });

    const line = container.querySelector("[data-slot=local-service-command]");
    expect(line?.textContent).toContain("node (next-server (v16.3.0))");
    expect(line?.textContent).not.toContain("node ((v16.3.0))");
    expect(container.querySelector("[data-testid=command-tooltip]")?.textContent).toBe(commandPath);
  });

  it("falls back to launch dir when command preview is missing", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <LocalServiceRow
          service={{ ...service, command_preview: null }}
        />,
      );
    });

    const line = container.querySelector("[data-slot=local-service-command]");
    expect(line?.textContent).toContain("node · /Users/lurunrun/own_space/OpenSource/atmos");
    expect(container.querySelector("[data-testid=command-tooltip]")).toBeNull();
  });
});

function installDom(): void {
  const browserWindow = new Window({ url: "http://localhost:3030" });
  const win = browserWindow as unknown as Window & typeof globalThis;

  setGlobal("window", win);
  setGlobal("document", win.document);
  setGlobal("navigator", win.navigator);
  setGlobal("HTMLElement", win.HTMLElement);
  setGlobal("Element", win.Element);
  setGlobal("Node", win.Node);
  setGlobal("Text", win.Text);
  setGlobal("Event", win.Event);
  setGlobal("IS_REACT_ACT_ENVIRONMENT", true);
}

function cleanupDom(): void {
  for (const key of [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "Element",
    "Node",
    "Text",
    "Event",
    "IS_REACT_ACT_ENVIRONMENT",
  ]) {
    Reflect.deleteProperty(globalThis, key);
  }
}

function setGlobal(key: string, value: unknown): void {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  });
}