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

  test("live editor wires slash, tooltip, and streaming commands", () => {
    const source = readFileSync(
      join(import.meta.dir, "../../components/MarkdownLiveEditor.tsx"),
      "utf8",
    );
    expect(source).toContain("slashFactory");
    expect(source).toContain("tooltipFactory");
    expect(source).toContain("startStream");
    expect(source).toContain("createMdLiveOnChangeGate");
    expect(source).not.toContain("skipFirstRef");
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
    expect(source).not.toContain("Send to terminal");
    expect(source).not.toContain("EditorPromptComposer");
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
