import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isolateOverlayScroll } from "./isolate-overlay-scroll";

const uiRoot = join(import.meta.dir, "../components/ui");

function readUi(file: string) {
  return readFileSync(join(uiRoot, file), "utf8");
}

describe("isolateOverlayScroll", () => {
  test("stops propagation then calls the consumer handler", () => {
    const calls: string[] = [];
    isolateOverlayScroll(
      {
        stopPropagation: () => {
          calls.push("stop");
        },
      },
      () => {
        calls.push("next");
      },
    );
    expect(calls).toEqual(["stop", "next"]);
  });
});

describe("overlay primitives reclaim scroll inside modal drawers", () => {
  const files = ["popover.tsx", "dropdown-menu.tsx", "select.tsx"] as const;

  test("portaled contents isolate wheel and restore pointer events", () => {
    for (const file of files) {
      const src = readUi(file);
      expect(src).toContain("overlayScrollClassName");
      expect(src).toContain("overlayScrollHandlers");
    }
  });
});
