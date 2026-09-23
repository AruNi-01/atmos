import { describe, expect, test } from "bun:test";

import { centerKeepAlivePanelStyle } from "@/app-shell/center-pane/center-keep-alive-panel-style";

const box = { top: 32, left: 12, width: 800, height: 600 };

describe("center keep-alive panel style", () => {
  test("hidden panels keep the active slot box so the scrollport does not jump", () => {
    const visible = centerKeepAlivePanelStyle(true, "pane-a", { "pane-a": box });
    const hidden = centerKeepAlivePanelStyle(false, "pane-a", { "pane-a": box });
    expect(visible).toMatchObject({
      top: 32,
      left: 12,
      width: 800,
      height: 600,
      zIndex: 1,
    });
    expect(hidden).toMatchObject({
      top: 32,
      left: 12,
      width: 800,
      height: 600,
      zIndex: 0,
      opacity: 0,
      pointerEvents: "none",
    });
  });

  test("fullscreen-covered and unmeasured panes collapse instead of covering the card", () => {
    expect(
      centerKeepAlivePanelStyle(true, "pane-b", { "pane-a": box, "pane-b": box }, "pane-a"),
    ).toMatchObject({ width: 0, height: 0 });
    expect(
      centerKeepAlivePanelStyle(false, "pane-a", { "pane-a": { top: 0, left: 0, width: 0, height: 0 } }),
    ).toMatchObject({ width: 0, height: 0 });
    expect(centerKeepAlivePanelStyle(true, undefined, { "pane-a": box })).toBeUndefined();
  });
});
