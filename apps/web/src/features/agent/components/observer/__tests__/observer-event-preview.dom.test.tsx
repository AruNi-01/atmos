// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Window } from "happy-dom";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import type { AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import type { AgentActivity, AgentToolLine } from "@atmos/api-types/ws/dto/events";
import { collectTurnFileChanges } from "@/features/agent/lib/tool-results/turn-file-changes";
import enMessages from "../../../../../../messages/en.json";

mock.module("next/navigation", () => ({
  usePathname: () => "/agent-observer",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push() {}, replace() {}, prefetch() {} }),
}));

// The @workspace/ui barrel pulls packages/ui self-imports bun cannot resolve.
// apps/web path-maps the specifier onto this file. The argument must be a string
// literal so bun hoists the mock ahead of imports. These stand-ins keep Chat's
// closed-by-default tool card and the user bubble class.
let sharedUiStub: ReturnType<typeof workspaceUiStub> | undefined;
function loadWorkspaceUiStub() {
  sharedUiStub ??= workspaceUiStub();
  return sharedUiStub;
}
mock.module("../../../../../../../../packages/ui/src/index.ts", () => loadWorkspaceUiStub());
mock.module("@workspace/ui", () => loadWorkspaceUiStub());

function workspaceUiStub() {
  const CollapsibleContext = React.createContext<{ open: boolean; toggle: () => void } | null>(null);

  function cn(...inputs: Array<string | false | null | undefined>) {
    return inputs.filter((value) => typeof value === "string" && value.length > 0).join(" ");
  }

  function Message({
    from,
    className,
    children,
    ...rest
  }: React.HTMLAttributes<HTMLDivElement> & { from?: string }) {
    return (
      <div className={cn(from === "user" ? "is-user" : "is-assistant", className)} {...rest}>
        {children}
      </div>
    );
  }

  function MessageContent({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
    return <div {...rest}>{children}</div>;
  }

  function MessageResponse({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
    return <div {...rest}>{children}</div>;
  }

  function Collapsible({
    defaultOpen = false,
    open: openProp,
    onOpenChange,
    children,
    ...rest
  }: React.HTMLAttributes<HTMLDivElement> & {
    defaultOpen?: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) {
    const [uncontrolled, setUncontrolled] = React.useState(defaultOpen);
    const open = openProp ?? uncontrolled;
    const setOpen = (next: boolean) => {
      onOpenChange?.(next);
      if (openProp === undefined) setUncontrolled(next);
    };
    return (
      <CollapsibleContext.Provider value={{ open, toggle: () => setOpen(!open) }}>
        <div data-slot="collapsible" data-state={open ? "open" : "closed"} {...rest}>
          {children}
        </div>
      </CollapsibleContext.Provider>
    );
  }

  function CollapsibleTrigger({
    asChild,
    children,
    onClick,
    ...rest
  }: React.HTMLAttributes<HTMLElement> & { asChild?: boolean }) {
    const ctx = React.useContext(CollapsibleContext);
    const handle = (event: React.MouseEvent<HTMLElement>) => {
      onClick?.(event);
      ctx?.toggle();
    };
    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<{ onClick?: (event: React.MouseEvent<HTMLElement>) => void }>;
      return React.cloneElement(child, {
        ...rest,
        "data-slot": "collapsible-trigger",
        "data-state": ctx?.open ? "open" : "closed",
        onClick: (event: React.MouseEvent<HTMLElement>) => {
          child.props.onClick?.(event);
          handle(event);
        },
      });
    }
    return (
      <button type="button" data-slot="collapsible-trigger" data-state={ctx?.open ? "open" : "closed"} onClick={handle} {...rest}>
        {children}
      </button>
    );
  }

  function CollapsibleContent({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
    const ctx = React.useContext(CollapsibleContext);
    if (!ctx?.open) return null;
    return (
      <div data-slot="collapsible-content" data-state="open" {...rest}>
        {children}
      </div>
    );
  }

  function Pass({
    children,
    asChild,
    ...rest
  }: React.HTMLAttributes<HTMLDivElement> & { asChild?: boolean }) {
    if (asChild && React.isValidElement(children)) return children;
    return <div {...rest}>{children}</div>;
  }

  function TextShimmer({
    children,
    as: As = "span",
    className,
  }: {
    children?: React.ReactNode;
    as?: React.ElementType;
    className?: string;
    duration?: number;
  }) {
    return <As className={className}>{children}</As>;
  }

  return {
    cn,
    Message,
    MessageContent,
    MessageResponse,
    Collapsible,
    CollapsibleTrigger,
    CollapsibleContent,
    TextShimmer,
    Tooltip: Pass,
    TooltipContent: Pass,
    TooltipTrigger: Pass,
    AcpTerminal: Pass,
    AcpTerminalContent: Pass,
    DropdownMenu: Pass,
    DropdownMenuContent: Pass,
    DropdownMenuItem: Pass,
    DropdownMenuTrigger: Pass,
    Dialog: Pass,
    DialogContent: Pass,
    DialogTitle: Pass,
    Select: Pass,
    SelectContent: Pass,
    SelectItem: Pass,
    SelectTrigger: Pass,
    SelectValue: Pass,
    ImageGeneration: Pass,
    toastManager: { add() {}, close() {}, promise() { return Promise.resolve(); } },
    getFileIconProps: () => ({ alt: "file" }),
  };
}

const { ObserverEventPreview } = await import("../ObserverEventPreview");

const PATCH = "--- a/src/b.ts\n+++ b/src/b.ts\n@@ -1,1 +1,1 @@\n-old\n+new\n";

function line(partial: Partial<AgentToolLine> & Pick<AgentToolLine, "name">): AgentToolLine {
  return {
    detail: "",
    state: "ok",
    started_at: "t",
    repeat: 1,
    ...partial,
  };
}

function activity(partial: Partial<AgentActivity> = {}): AgentActivity {
  return {
    session_id: "lead",
    tool: "claude-code",
    last_state: "running",
    todos: [],
    children: [],
    turns: [],
    turns_omitted: 0,
    started_at: "t",
    last_event_at: "t",
    ...partial,
  };
}

const chatEdit: AgentPart = {
  type: "tool_call",
  tool_call_id: "edit-1",
  name: "Edit",
  kind: "edit",
  status: "completed",
  params: { type: "edit", path: "src/b.ts" },
  result: { type: "text", text: PATCH },
};

let root: Root | null = null;

describe("ObserverEventPreview", () => {
  beforeEach(() => {
    installDom();
  });

  afterEach(async () => {
    if (root) {
      const current = root;
      root = null;
      await act(async () => {
        current.unmount();
      });
    }
    cleanupDom();
  });

  it("uses a chat bubble, a visible reply, and collapsed chat tools", async () => {
    const opened: string[] = [];
    const container = renderPreview(activity({
      turns: [
        {
          turn_id: 1,
          prompt: "scan the repo",
          reply: "The specs live under specs/.",
          started_at: "t",
          ended_at: "t2",
          tools: [
            line({ name: "Bash", kind: "execute", detail: "ls", output: "observer-out" }),
            line({ name: "Edit", kind: "edit", path: "src/b.ts", detail: "src/b.ts", diff: PATCH, output: PATCH }),
            line({ name: "Read", kind: "read", path: "README.md", detail: "README.md", output: "hello" }),
          ],
          todos: [],
          spawned_child_ids: ["sa-a"],
        },
      ],
      children: [
        {
          child_id: "sa-a",
          name: "Explore · scan specs",
          agent_type: "Explore",
          description: "scan specs",
          prompt: "You are exploring the Atmos monorepo at /tmp",
          reply: "Found the specs index.",
          state: "idle",
          recent_tools: [
            line({ name: "Edit", kind: "edit", path: "src/nested.ts", detail: "src/nested.ts", diff: PATCH }),
          ],
          started_at: "t",
          last_event_at: "t",
          parent_child_id: undefined,
        },
      ],
    }), undefined, (id) => {
      opened.push(id);
    });

    const prompt = container.querySelector("[data-observer-prompt]");
    expect(prompt?.className).toContain("is-user");
    expect(prompt?.querySelector("[data-user-message-body]")?.textContent).toContain("scan the repo");
    expect(container.textContent).toContain("The specs live under specs/.");
    expect(container.querySelectorAll("[data-observer-reply]").length).toBe(1);

    const bash = container.querySelector('[data-observer-tool="Bash"]');
    expect(bash?.textContent).not.toContain("observer-out");
    expect(bash?.querySelector("[data-state='open']")).toBeNull();
    const read = container.querySelector('[data-observer-tool="Read"]');
    expect(read?.textContent).not.toContain("hello");
    expect(read?.textContent).toContain("README");

    const edit = container.querySelector('[data-observer-tool="Edit"]');
    expect(edit?.textContent).not.toContain("+new");
    expect(edit?.querySelector("[data-agent-diff]")).toBeNull();
    const expand = edit?.querySelector("[data-slot='collapsible-trigger']") as HTMLElement | null;
    expect(expand).toBeTruthy();
    await act(async () => {
      expand?.click();
    });
    expect(expand?.getAttribute("data-state")).toBe("open");
    expect(edit?.querySelector("[data-agent-diff='pr-discussion']")).toBeTruthy();

    const nested = container.querySelector('[data-observer-nested-subagent="sa-a"]');
    const row = nested?.querySelector("[data-agent-subagent-row]") as HTMLButtonElement | null;
    expect(row?.tagName).toBe("BUTTON");
    expect(row?.textContent).toContain("Ran subagent");
    expect(row?.textContent).toContain("scan specs");
    expect(nested?.textContent).not.toContain("You are exploring the Atmos monorepo at /tmp");
    expect(nested?.textContent).not.toContain("Found the specs index.");
    expect(nested?.querySelector("[data-observer-tool]")).toBeNull();
    expect(nested?.querySelector("[data-observer-reply]")).toBeNull();
    expect(nested?.querySelector("[data-observer-prompt]")).toBeNull();
    await act(async () => {
      row?.click();
    });
    expect(opened).toEqual(["sa-a"]);

    const summary = collectTurnFileChanges([chatEdit], { includeRanges: false });
    const file = container.querySelector('[data-observer-file="src/b.ts"]');
    expect(file?.getAttribute("data-observer-additions")).toBe(String(summary[0]?.additions));
    expect(file?.getAttribute("data-observer-deletions")).toBe(String(summary[0]?.deletions));
    expect(container.querySelectorAll("[data-observer-files]").length).toBeGreaterThan(0);
  });

  it("hides the files card while the lead turn is still open", () => {
    const container = renderPreview(activity({
      turns: [
        {
          turn_id: 1,
          prompt: "scan the repo",
          started_at: "t",
          tools: [
            line({ name: "Edit", kind: "edit", path: "src/b.ts", diff: PATCH, output: PATCH }),
          ],
          todos: [],
          spawned_child_ids: [],
        },
      ],
    }));
    expect(container.querySelector("[data-observer-tool='Edit']")).toBeTruthy();
    expect(container.querySelector("[data-observer-files]")).toBeNull();
    expect(container.querySelector("[data-observer-file]")).toBeNull();
  });

  it("shows a subagent files card only after that child has stopped", () => {
    const child = {
      child_id: "sa-a",
      name: "Explore",
      agent_type: "Explore",
      description: "scan specs",
      prompt: "scan specs for the files card",
      state: "idle" as const,
      recent_tools: [
        line({ name: "Edit", kind: "edit", path: "src/b.ts", diff: PATCH, output: PATCH }),
      ],
      started_at: "t",
      last_event_at: "t",
    };
    const summary = collectTurnFileChanges([chatEdit], { includeRanges: false });
    const settled = renderPreview(activity({ children: [child] }), "sa-a");
    expect(settled.querySelector("[data-user-message-body]")?.textContent).toContain("scan specs for the files card");
    expect(settled.textContent).not.toContain("+new");
    const file = settled.querySelector('[data-observer-file="src/b.ts"]');
    expect(file?.getAttribute("data-observer-additions")).toBe(String(summary[0]?.additions));
    expect(file?.getAttribute("data-observer-deletions")).toBe(String(summary[0]?.deletions));

    cleanupMounted();
    const running = renderPreview(activity({
      children: [{ ...child, state: "running" }],
    }), "sa-a");
    expect(running.querySelector("[data-observer-tool='Edit']")).toBeTruthy();
    expect(running.querySelector("[data-observer-files]")).toBeNull();
  });
});

function renderPreview(
  value: AgentActivity,
  childId?: string,
  onOpenChild?: (childId: string) => void,
): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC">
        <ObserverEventPreview activity={value} childId={childId} onOpenChild={onOpenChild} />
      </NextIntlClientProvider>,
    );
  });
  return container;
}

function cleanupMounted(): void {
  if (!root) return;
  const current = root;
  root = null;
  act(() => {
    current.unmount();
  });
}

function installDom(): void {
  const browserWindow = new Window({ url: "http://localhost:3030" });
  const win = browserWindow as unknown as Window & typeof globalThis;
  setGlobal("window", win);
  setGlobal("document", win.document);
  setGlobal("navigator", win.navigator);
  setGlobal("HTMLElement", win.HTMLElement);
  setGlobal("Element", win.Element);
  setGlobal("SVGElement", win.SVGElement);
  setGlobal("Node", win.Node);
  setGlobal("Text", win.Text);
  setGlobal("Event", win.Event);
  setGlobal("MouseEvent", win.MouseEvent);
  setGlobal("getComputedStyle", win.getComputedStyle.bind(win));
  setGlobal("ResizeObserver", win.ResizeObserver);
  setGlobal("IS_REACT_ACT_ENVIRONMENT", true);
}

function cleanupDom(): void {
  for (const key of [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "Element",
    "SVGElement",
    "Node",
    "Text",
    "Event",
    "MouseEvent",
    "getComputedStyle",
    "ResizeObserver",
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
