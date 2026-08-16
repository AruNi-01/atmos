// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Window } from "happy-dom";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const saveMock = mock(async () => undefined);
const getMock = mock(async () => ({
  scripts: { setup: "npm i", run: "", purge: "" },
}));

mock.module("@workspace/ui", () => ({
  cn: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(" "),
  Button: ({ children, loading: _loading, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) => (
    <button {...props}>{children}</button>
  ),
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  Skeleton: () => <div data-testid="skeleton" />,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  toastManager: { add: () => undefined },
}));

const translate = (key: string) => key;

mock.module("next-intl", () => ({
  useTranslations: () => translate,
}));

function MockScriptEditor({
  value,
  onChange,
  onCreateEditor,
}: {
  value: string;
  onChange?: (value: string) => void;
  onCreateEditor?: (view: {
    focus: () => void;
    state: {
      doc: { toString: () => string };
      selection: { main: { from: number; to: number } };
    };
    dispatch: (spec: {
      changes: { from: number; to: number; insert: string };
      selection: { anchor: number };
    }) => void;
  }) => void;
}) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    const field = textareaRef.current;
    if (!field) return;
    onCreateEditor?.({
      focus: () => field.focus(),
      get state() {
        return {
          doc: { toString: () => field.value },
          selection: {
            main: { from: field.selectionStart, to: field.selectionEnd },
          },
        };
      },
      dispatch: ({ changes, selection }) => {
        onChange?.(
          field.value.slice(0, changes.from) + changes.insert + field.value.slice(changes.to),
        );
        requestAnimationFrame(() => {
          field.focus();
          field.setSelectionRange(selection.anchor, selection.anchor);
        });
      },
    });
  }, [onChange, onCreateEditor]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
    />
  );
}

mock.module("next/dynamic", () => ({
  default: () => MockScriptEditor,
}));

mock.module("@/api/ws-api", () => ({
  wsScriptApi: {
    get: getMock,
    save: saveMock,
  },
}));

const { WorkspaceScriptDialog } = await import("../WorkspaceScriptDialog");

let root: Root | null = null;

describe("WorkspaceScriptDialog", () => {
  beforeEach(() => {
    installDom();
    getMock.mockClear();
    saveMock.mockClear();
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

  it("loads scripts into a lifecycle rail and focused editor", async () => {
    const container = await renderDialog();

    expect(container.querySelector('[data-script-phase="setup"]')?.getAttribute("aria-selected")).toBe("true");
    expect(container.querySelector('[data-script-phase="run"]')).not.toBeNull();
    expect(container.querySelector('[data-script-phase="purge"]')).not.toBeNull();
    expect(
      (container.querySelector("#workspace-script-setup textarea") as HTMLTextAreaElement | null)
        ?.value,
    ).toBe("npm i");
    expect(container.querySelector('[data-env-var="rootProjectPath"]')).not.toBeNull();
    expect(container.textContent).not.toContain("text-white");
  });

  it("inserts an env token into the active script and marks the phase edited", async () => {
    const container = await renderDialog();
    const insert = container.querySelector('[data-env-var="workspaceName"]') as HTMLButtonElement;
    const editor = container.querySelector("#workspace-script-setup textarea") as HTMLTextAreaElement;
    editor.selectionStart = editor.value.length;
    editor.selectionEnd = editor.value.length;

    await act(async () => {
      insert.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(editor.value).toBe("npm i $ATMOS_WORKSPACE_NAME");
    expect(container.querySelector('[data-script-phase="setup"]')?.getAttribute("data-script-phase-status")).toBe("edited");
    expect(container.textContent).toContain("unsaved");
  });
});

async function renderDialog() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <WorkspaceScriptDialog projectId="proj-1" isOpen onClose={() => undefined} />,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
  return container;
}

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
  setGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    win.setTimeout(() => callback(0), 0),
  );
  setGlobal("cancelAnimationFrame", (id: number) => win.clearTimeout(id));
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
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "IS_REACT_ACT_ENVIRONMENT",
  ]) {
    Reflect.deleteProperty(globalThis, key);
  }
}

function setGlobal(key: string, value: unknown) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  });
}
