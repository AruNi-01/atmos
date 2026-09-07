import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { presentAiContextChip } from "@/shared/lib/ai-context-protocol";
import type { SimulatorClaimListItem } from "@atmos/api-types/ws/dto/simulator";
import {
  DEVICE_PREVIEW_SLASH_COMMAND_ID,
  buildDevicePreviewSlashCommand,
  formatDevicePreviewClipboard,
  formatDevicePreviewListPrompt,
  formatDevicePreviewPrompt,
  matchesDevicePreviewSlashQuery,
  resolveDevicePreviewPromptFromClaims,
} from "../device-preview-agent-prompt";

const claim: SimulatorClaimListItem = {
  udid: "Pixel_8",
  name: "Pixel 8",
  platform: "android",
  helper: "serve_emu",
  workspace_id: "ws_login",
  workspace_name: "Feature login",
  project_id: "proj_app",
  project_name: "My App",
  current: true,
};

const other: SimulatorClaimListItem = {
  udid: "IPHONE-UDID",
  name: "iPhone 16",
  platform: "ios",
  helper: "serve_sim",
  workspace_id: "ws_other",
  workspace_name: "Other workspace",
  project_id: "proj_other",
  project_name: "Other app",
  current: false,
};

function hasHelperNetworkLeak(text: string): boolean {
  return (
    /^- (url|port|token):/m.test(text) ||
    text.includes("http://") ||
    text.includes("https://") ||
    text.includes("127.0.0.1")
  );
}

describe("device-preview agent prompt", () => {
  it("formats a claimed device without helper url or port", () => {
    const prompt = formatDevicePreviewPrompt(claim);
    expect(prompt).toContain("Load skill atmos-device-preview");
    expect(prompt).toContain("- udid: Pixel_8");
    expect(prompt).toContain("- name: Pixel 8");
    expect(prompt).toContain("- platform: android");
    expect(prompt).toContain("- project: My App (id: proj_app)");
    expect(prompt).toContain("- workspace: Feature login (id: ws_login)");
    expect(prompt).toContain("`atmos simulator`");
    expect(hasHelperNetworkLeak(prompt)).toBe(false);
  });

  it("wraps clipboard with the device-preview AI-context prefix", () => {
    const prompt = formatDevicePreviewPrompt(claim);
    const clipboard = formatDevicePreviewClipboard(prompt);
    expect(clipboard.startsWith("atmos://context/device-preview\n")).toBe(true);
    expect(clipboard).toContain(prompt);
    expect(hasHelperNetworkLeak(clipboard)).toBe(false);
  });

  it("lists live claims and asks which udid when none is bound", () => {
    const prompt = formatDevicePreviewListPrompt([claim, other]);
    expect(prompt).toContain("Pixel 8 · android · My App · Feature login");
    expect(prompt).toContain("iPhone 16 · ios · Other app · Other workspace");
    expect(prompt.toLowerCase()).toContain("which udid");
    expect(prompt).toContain("Do not auto-start");
    expect(hasHelperNetworkLeak(prompt)).toBe(false);
  });

  it("asks the user to Start when the claim list is empty", () => {
    const prompt = formatDevicePreviewListPrompt([]);
    expect(prompt).toContain("Start the Simulator tab");
    expect(prompt).toContain("Do not auto-start Device Preview");
    expect(hasHelperNetworkLeak(prompt)).toBe(false);
  });

  it("binds this workspace's current claim and otherwise uses the list prompt", () => {
    expect(resolveDevicePreviewPromptFromClaims([claim, other], "ws_login")).toContain(
      "- udid: Pixel_8",
    );
    expect(
      resolveDevicePreviewPromptFromClaims([claim, other], "ws_missing"),
    ).toContain("which udid");
    expect(resolveDevicePreviewPromptFromClaims([claim, other], null)).toContain(
      "which udid",
    );
  });

  it("matches slash queries like other Atmos composer commands", () => {
    expect(matchesDevicePreviewSlashQuery("")).toBe(true);
    expect(matchesDevicePreviewSlashQuery("device")).toBe(true);
    expect(matchesDevicePreviewSlashQuery("preview")).toBe(true);
    expect(matchesDevicePreviewSlashQuery("simulator")).toBe(true);
    expect(matchesDevicePreviewSlashQuery("desktop")).toBe(false);
    expect(
      buildDevicePreviewSlashCommand({
        label: "Device preview",
        description: "Attach the claim",
      }).id,
    ).toBe(DEVICE_PREVIEW_SLASH_COMMAND_ID);
  });

  it("derives the chip label from the device name", () => {
    const labeled = presentAiContextChip(
      "device-preview",
      formatDevicePreviewPrompt(claim),
    );
    expect(labeled.label).toBe("Pixel 8");
    expect(labeled.tone).toBe("cyan");
    expect(labeled.icon).toBe("layout");
    expect(
      presentAiContextChip("device-preview", formatDevicePreviewListPrompt([])).label,
    ).toBe("Device preview");
  });
});

describe("SimulatorPanel Agent overlay", () => {
  it("hosts agentCopy on Atmos SimulatorPanel, not under vendor/", () => {
    const panelPath = join(import.meta.dir, "../../components/SimulatorPanel.tsx");
    const panel = readFileSync(panelPath, "utf8");
    expect(panelPath).not.toContain("/vendor/");
    expect(panel).toContain('t("agentCopy")');
    expect(panel).toContain('t("agentCopied")');
    expect(panel).toContain("formatDevicePreviewClipboard");
    expect(panel).toContain('phase === "ready"');
    expect(panel).not.toContain("toast");
    expect(panel).not.toContain("vendor/");
  });
});
