// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Window } from "happy-dom";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { ComposerHandle } from "../PromptComposer";
import { formatSkillDisableProtocol } from "@/features/skills/lib/skill-disable-protocol";
import {
  formatSideChatProtocol,
  formatSpawnProtocol,
} from "@/features/terminal/lib/terminal-ai-context-protocol";
import {
  BROWSER_USE_SKILL_FALLBACK_PATH,
  BROWSER_USE_SLASH_COMMAND_ID,
} from "@/features/welcome/lib/slash-browser-use";
import { DESKTOP_USE_SKILL_FALLBACK_PATH } from "@/features/welcome/lib/slash-desktop-use";
import {
  DYNAMIC_SKILLS_SLASH_COMMAND_ID,
  SIDE_SLASH_COMMAND_ID,
  SPAWN_SLASH_COMMAND_ID,
  slashCommandChipToneClass,
  slashCommandVisual,
} from "@/features/welcome/lib/slash-command-visual";
import {
  __resetAiContextPayloadsForTests,
  registerAiContextPrompt,
} from "@/shared/lib/ai-context-protocol";

type TestIconProps = {
  name: string;
  isDir: boolean;
  className?: string;
};

mock.module("@workspace/ui", () => ({
  cn: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(" "),
  getFileIconProps: ({ className }: TestIconProps) => ({
    alt: "",
    className,
    src: "/icons/file.svg",
  }),
}));

const { PromptComposer } = await import("../PromptComposer");

let root: Root | null = null;

beforeEach(() => {
  installDom();
  __resetAiContextPayloadsForTests();
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
  __resetAiContextPayloadsForTests();
});

describe("PromptComposer slash command chip visuals", () => {
  it("keeps list glyph+tone on selected atmos command chips", async () => {
    const { editor, composerRef } = await mountComposer();

    const runLogToken = registerAiContextPrompt("run-log", "This is an Atmos Run log.");
    const deviceToken = registerAiContextPrompt(
      "device-preview",
      "Drive the Atmos Device Preview for this claimed simulator.",
    );

    await act(async () => {
      composerRef.current?.setText(
        [
          `/skill:${BROWSER_USE_SKILL_FALLBACK_PATH}`,
          `/skill:${DESKTOP_USE_SKILL_FALLBACK_PATH}`,
          `/cmd:${BROWSER_USE_SLASH_COMMAND_ID}`,
          `/cmd:copy-request-id`,
          runLogToken,
          deviceToken,
          formatSkillDisableProtocol(),
          formatSideChatProtocol("side-1"),
          formatSpawnProtocol("spawn-1"),
        ].join(" "),
      );
    });

    assertChipLooksLike(editor, "[data-kind='skill']", 0, slashCommandVisual("browser-use"));
    assertChipLooksLike(editor, "[data-kind='skill']", 1, slashCommandVisual("desktop-use"));
    assertChipLooksLike(
      editor,
      "[data-kind='command']",
      0,
      slashCommandVisual(BROWSER_USE_SLASH_COMMAND_ID),
    );
    assertChipLooksLike(editor, "[data-kind='command']", 1, slashCommandVisual("copy-request-id"));
    assertChipLooksLike(
      editor,
      "[data-kind='ai-context:run-log']",
      0,
      slashCommandVisual("view-run-logs"),
    );
    assertChipLooksLike(
      editor,
      "[data-kind='ai-context:device-preview']",
      0,
      slashCommandVisual("device-preview"),
    );
    assertChipLooksLike(
      editor,
      "[data-kind='skill-disable']",
      0,
      slashCommandVisual(DYNAMIC_SKILLS_SLASH_COMMAND_ID),
    );
    assertChipLooksLike(editor, "[data-kind='side']", 0, slashCommandVisual(SIDE_SLASH_COMMAND_ID));
    assertChipLooksLike(
      editor,
      "[data-kind='spawn']",
      0,
      slashCommandVisual(SPAWN_SLASH_COMMAND_ID),
    );
  });
});

function assertChipLooksLike(
  editor: HTMLElement,
  selector: string,
  index: number,
  visual: ReturnType<typeof slashCommandVisual>,
) {
  const chip = editor.querySelectorAll(selector)[index];
  if (!chip) throw new Error(`missing chip ${selector} #${index}`);
  expect(chip.getAttribute("data-slash-glyph")).toBe(visual.glyph);
  const toneClass = slashCommandChipToneClass(visual.tone);
  for (const token of toneClass.split(/\s+/)) {
    expect(chip.className).toContain(token);
  }
  expect(chip.querySelector("svg")).not.toBeNull();
}

async function mountComposer(): Promise<{
  editor: HTMLElement;
  composerRef: React.RefObject<ComposerHandle | null>;
}> {
  const composerRef = React.createRef<ComposerHandle>();
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<PromptComposer ref={composerRef} />);
  });
  const editor = container.querySelector<HTMLElement>("[contenteditable='true']");
  if (!editor) throw new Error("PromptComposer editor not found");
  return { editor, composerRef };
}

function installDom(): void {
  const browserWindow = new Window({ url: "http://localhost:3030" });
  const win = browserWindow as unknown as Window &
    typeof globalThis & {
      ResizeObserver?: typeof ResizeObserver;
    };

  setGlobal("window", win);
  setGlobal("document", win.document);
  setGlobal("navigator", win.navigator);
  setGlobal("HTMLElement", win.HTMLElement);
  setGlobal("Element", win.Element);
  setGlobal("Node", win.Node);
  setGlobal("Text", win.Text);
  setGlobal("Event", win.Event);
  setGlobal("KeyboardEvent", win.KeyboardEvent);
  setGlobal("MutationObserver", win.MutationObserver);
  setGlobal("ResizeObserver", win.ResizeObserver);
  setGlobal("getComputedStyle", win.getComputedStyle.bind(win));
  setGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  win.SyntaxError = SyntaxError;
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
    "KeyboardEvent",
    "MutationObserver",
    "ResizeObserver",
    "getComputedStyle",
    "IS_REACT_ACT_ENVIRONMENT",
  ]) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (globalThis as Record<string, unknown>)[key];
  }
}

function setGlobal(key: string, value: unknown): void {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  });
}
