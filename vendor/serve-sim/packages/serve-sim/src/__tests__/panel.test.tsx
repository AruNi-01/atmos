import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Panel } from "../client/Panel";

describe("Panel", () => {
  test("left and right panels share the floating card chrome", () => {
    const left = renderToStaticMarkup(
      <Panel open width={320} side="left">
        Sidebar
      </Panel>,
    );
    const right = renderToStaticMarkup(
      <Panel open width={320} side="right">
        Tools
      </Panel>,
    );

    for (const html of [left, right]) {
      expect(html).toContain("top-3");
      expect(html).toContain("bottom-3");
      expect(html).toContain("rounded-[14px]");
      expect(html).toContain("border border-white/10");
      expect(html).toContain("shadow-[0_12px_40px_rgba(0,0,0,0.55)]");
      expect(html).not.toContain("rounded-none");
    }
    expect(left).toContain("left-3");
    expect(right).toContain("right-3");
  });
});
