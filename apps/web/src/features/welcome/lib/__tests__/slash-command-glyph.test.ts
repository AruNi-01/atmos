import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { BROWSER_USE_SLASH_COMMAND_ID } from "@/features/welcome/lib/slash-browser-use";
import {
  applySlashCommandChipLook,
  buildSlashCommandChipIcon,
} from "@/features/welcome/lib/slash-command-glyph";
import {
  DYNAMIC_SKILLS_SLASH_COMMAND_ID,
  SLASH_COMMAND_GLYPH_NODES,
  slashCommandChipToneClass,
  slashCommandVisual,
} from "@/features/welcome/lib/slash-command-visual";

describe("slash command chip glyph renderer", () => {
  beforeEach(() => {
    const browserWindow = new Window({ url: "http://localhost:3030" });
    const win = browserWindow as unknown as typeof globalThis;
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      writable: true,
      value: win.document,
    });
  });

  afterEach(() => {
    delete (globalThis as { document?: unknown }).document;
  });

  it("paints chip icon+tone from the shared catalog", () => {
    const cases = [
      "browser-use",
      "desktop-use",
      "view-run-logs",
      "device-preview",
      DYNAMIC_SKILLS_SLASH_COMMAND_ID,
      "side",
      "spawn",
      "copy-request-id",
    ] as const;

    for (const commandId of cases) {
      const visual = slashCommandVisual(commandId);
      const span = document.createElement("span");
      span.className = "chip";
      applySlashCommandChipLook(span, visual);
      expect(span.dataset.slashGlyph).toBe(visual.glyph);
      for (const token of slashCommandChipToneClass(visual.tone).split(/\s+/)) {
        expect(span.className).toContain(token);
      }
      const svg = span.querySelector("svg");
      expect(svg).not.toBeNull();
    }
  });

  it("uses the same Browser Use paths as the picker catalog", () => {
    const svg = buildSlashCommandChipIcon(slashCommandVisual(BROWSER_USE_SLASH_COMMAND_ID).glyph);
    const paths = [...svg.querySelectorAll("path")].map((path) => path.getAttribute("d"));
    expect(paths).toEqual(flattenPathD(SLASH_COMMAND_GLYPH_NODES["browser-use"]));
  });
});

function flattenPathD(
  nodes: (typeof SLASH_COMMAND_GLYPH_NODES)[keyof typeof SLASH_COMMAND_GLYPH_NODES],
): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    if (node.type === "path") out.push(node.d);
    if (node.type === "g") out.push(...flattenPathD(node.children));
  }
  return out;
}
