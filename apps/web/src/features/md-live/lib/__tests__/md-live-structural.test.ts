import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

describe("md-live structural gates", () => {
  test("github and code-review do not import the live editor", () => {
    const github = readFileSync(
      join(import.meta.dir, "../../../github/lib/pr-detail-parts.tsx"),
      "utf8",
    );
    expect(github).not.toContain("MarkdownLiveEditor");
    expect(github).toContain("MarkdownRenderer");
  });

  test("adapters are copy and headless only", () => {
    const source = readFileSync(
      join(import.meta.dir, "../md-live-adapters.ts"),
      "utf8",
    );
    expect(source).toContain("copyMdLivePrompt");
    expect(source).toContain("buildHeadlessPrompt");
    expect(source).not.toContain("terminal-current");
    expect(source).not.toContain("terminal_input");
  });

  test("web host wraps package editor and supplies design-system slash/toolbar", () => {
    const source = readFileSync(
      join(import.meta.dir, "../../components/MarkdownLiveEditor.tsx"),
      "utf8",
    );
    const slash = readFileSync(
      join(import.meta.dir, "../../components/MdLiveSlashMenu.tsx"),
      "utf8",
    );
    const toolbar = readFileSync(
      join(import.meta.dir, "../../components/MdLiveSelectionToolbar.tsx"),
      "utf8",
    );
    expect(source).toContain('@atmos/md-live/ui');
    expect(source).toContain("MdLiveEditor");
    expect(source).toContain("mdLiveEmbedBlock");
    expect(source).toContain("slashMenu={MdLiveSlashMenu}");
    expect(source).toContain("selectionToolbar={MdLiveSelectionToolbar}");
    expect(source).toContain("onOpenMedia");
    expect(source).toContain("mdLiveMediaViewPlugin");
    expect(source).not.toContain("slashFactory");
    expect(slash).toContain("CommandItem");
    expect(slash).toContain("ArrowDown");
    expect(slash).toContain("slashOverlayIsOpen");
    expect(slash).toContain("scrollActiveListItemIntoView");
    expect(slash).toContain("disablePointerSelection");
    expect(slash).toContain("itemRefs.current, selectedIndex, 3");
    expect(slash).toContain('kind: "open"');
    expect(slash).not.toContain("slashFilter");
    expect(slash).not.toContain("onMouseEnter={() => setSelectedIndex");
    expect(toolbar).toContain("DropdownMenu");
    expect(toolbar).toContain("DropdownMenuContent");
  });

  test("github embed open uses the native center tab", () => {
    const source = readFileSync(
      join(import.meta.dir, "../../embeds/open-embed.ts"),
      "utf8",
    );
    expect(source).toContain("openIssue");
    expect(source).toContain("openPullRequest");
    expect(source).toContain("activateCenterChromeTab");
  });

  test("composer dock reuses PromptComposer and has no terminal send", () => {
    const source = readFileSync(
      join(import.meta.dir, "../../components/MdLiveAgentDock.tsx"),
      "utf8",
    );
    expect(source).toContain("PromptComposer");
    expect(source).toContain("@/features/welcome/components/PromptComposer");
    expect(source).toContain("WelcomeAgentSelector");
    expect(source).toContain('placeholder={t("placeholder")}');
    expect(source).toContain("ArrowUp");
    expect(source).not.toContain("copyMdLivePrompt");
    expect(source).not.toContain("Send to terminal");
    expect(source).not.toContain("EditorPromptComposer");
    expect(source).not.toContain("{t(\"run\")}\n        </Button>");
    expect(source).toContain("isTerminalAgentInputShortcut");
    expect(source).toContain("h-1 w-28 rounded-full");
    expect(source).toContain("pointer-events-none absolute inset-x-0 bottom-1.5");
    expect(source).toContain("grid-rows-[0fr]");
    expect(source).toContain("grid-rows-[1fr]");
    expect(source).toContain("MD_LIVE_HEADLESS_PTY");
    expect(source).toContain("connectWhileHidden");
    expect(source).toContain("shouldFireMdLiveFenceTimeout");
    expect(source).toContain("stripTerminalAnsi");
    expect(source).toContain("resolveMdLiveRunEditor");
    expect(source).toContain("resolveMdLiveRunGrid");
    const onRun = source.slice(source.indexOf("const onRun"));
    expect(onRun.indexOf("resolveMdLiveRunEditor")).toBeGreaterThan(-1);
    expect(onRun.indexOf("resolveMdLiveRunGrid")).toBeGreaterThan(-1);
    expect(onRun.indexOf("resolveMdLiveRunEditor")).toBeLessThan(onRun.indexOf("lockMdLiveStream"));
    expect(onRun.indexOf("resolveMdLiveRunGrid")).toBeLessThan(onRun.indexOf("lockMdLiveStream"));
    expect(source).toContain("restoreAndUnlockMdLiveStream");
  });

  test("terminal grid handle is published from the frame callback ref", () => {
    const frame = readFileSync(
      join(import.meta.dir, "../../../../app-shell/workspace-center-frame.tsx"),
      "utf8",
    );
    const stage = readFileSync(
      join(import.meta.dir, "../../../../app-shell/CenterStage.tsx"),
      "utf8",
    );
    expect(frame).toContain("registerMdLiveTerminalGrid");
    expect(frame).toContain("publishMdLiveTerminalGrid");
    expect(stage).not.toContain("useLayoutEffect(() => {\n    registerMdLiveTerminalGrid");
  });

  test("hidden headless PTY connects without FitAddon on an inactive grid", () => {
    const terminal = readFileSync(
      join(import.meta.dir, "../../../terminal/components/Terminal.tsx"),
      "utf8",
    );
    expect(terminal).toContain("shouldConnectHiddenPty");
    expect(terminal).toContain("HIDDEN_PTY_CONNECT_GRID");
    expect(terminal).toContain("connectWhileHidden");
  });
});
