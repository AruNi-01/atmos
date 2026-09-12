import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const setup = readFileSync(
  join(import.meta.dir, "../AutomationSetup.tsx"),
  "utf8",
);
const memory = readFileSync(
  join(import.meta.dir, "../AutomationMemoryEditor.tsx"),
  "utf8",
);
const expand = readFileSync(
  join(import.meta.dir, "../automation-editor-expand.tsx"),
  "utf8",
);
const form = readFileSync(
  join(import.meta.dir, "../../hooks/use-automation-setup-form.ts"),
  "utf8",
);

describe("automation markdown live editors", () => {
  test("setup instructions and memories use embedded live-md", () => {
    expect(setup).toContain("AutomationMemoryEditor");
    expect(setup).toContain("AutomationEditorExpandHost");
    expect(setup).toContain("automationMdLivePath(\"instructions\"");
    expect(setup).toContain("automationMdLivePath(\"memory\"");
    expect(setup).toContain("expandId=\"instructions\"");
    expect(setup).toContain("expandId=\"memory\"");
    expect(setup).toContain("chrome={false}");
    expect(setup).not.toContain("PromptComposer");
    expect(setup).not.toContain("WelcomeMentionPopover");
    expect(setup).not.toContain("SlashCommandPopover");
    expect(setup).not.toContain("useWelcomeComposerAttachments");
    expect(form).not.toContain("clearAttachments");
  });

  test("memory editor is live preview only", () => {
    expect(memory).toContain("MarkdownLiveEditor");
    expect(memory).toContain("embedded");
    expect(memory).toContain("enableAi={false}");
    expect(memory).toContain("enableMedia={false}");
    expect(memory).toContain("autoFocus={false}");
    expect(memory).toContain("getMdLiveEditor");
    expect(memory).toContain('focus({ caret: "preserve" })');
    expect(memory).toContain("AUTOMATION_EDITOR_ZOOM_MS");
    expect(memory).toContain("event.preventDefault()");
    expect(memory).toContain("z-50");
    expect(memory).toContain("pointer-events-none");
    expect(expand).toContain("covered:");
    expect(expand).toContain("boxRelativeToClip");
    expect(expand).toContain("fillVisibleClipBox");
    expect(memory).toContain('zoom.expanded ? "md-live--page-column"');
    expect(memory).toContain("canExpand && !zoom.expanded && \"pr-8\"");
    expect(memory).not.toContain("resolveAutomationEditorExpandCaret");
    expect(memory).toContain("Maximize2");
    expect(memory).toContain("Minimize2");
    expect(memory).toContain('t("expand")');
    expect(memory).toContain('t("collapse")');
    expect(expand).toContain("queryAutomationEditorExpandTarget");
    expect(expand).toContain("createPortal");
    expect(expand).toContain("if (!enabled || !clip) return node");
    expect(expand).toContain("applyRelativeEditorBox");
    expect(expand).toContain("placeholderBox");
    expect(expand).toContain("ResizeObserver");
    expect(expand).toContain("automationEditorZoomTransition");
    expect(expand).toContain("collapsing");
    expect(expand).not.toContain("setClip(null)");
    expect(expand).not.toContain("if (presented && clip)");
    expect(expand).not.toContain("md-live--page-column");
    expect(expand).not.toContain("zoomTransformCss");
    expect(expand).not.toContain("zoomTransformCss");
    expect(expand).not.toContain("releaseOverflowAlongPath");
    expect(expand).not.toContain("applyFixedEditorBox");
    expect(expand).not.toContain("AUTOMATION_EDITOR_ZOOM_INSET");
    expect(expand).not.toContain("insetEditorBox");
    expect(memory).toContain("zoom.collapsing");
    expect(memory).toContain("rounded-[inherit]");
    expect(memory).toContain("border-border");
    expect(memory).not.toContain("CENTER_STAGE_RADIUS_CLASS");
    expect(memory).not.toContain("rounded-none");
    expect(memory).not.toContain("fileHint");
    expect(memory).not.toContain("memory.md");
    expect(memory).not.toContain("BaseCodeMirrorEditor");
    expect(memory).not.toContain("MarkdownRenderer");
    expect(memory).not.toContain("isPreview");
    expect(memory).not.toContain("defaultPreview");
    expect(memory).not.toContain('t("editor")');
    expect(memory).not.toContain('t("preview")');
  });
});
