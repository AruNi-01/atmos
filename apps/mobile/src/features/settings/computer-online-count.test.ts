// @ts-expect-error bun:test is available at runtime but not in the mobile tsconfig types
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
// @ts-expect-error react-dom server types are not installed for the mobile app
import { renderToStaticMarkup } from "react-dom/server";
import { onlineStatusColor } from "@/features/computers/online-status-color";
import { mobileRenderColors } from "@/test-support/mobile-render-mock";

const { ComputerOnlineCount } = await import("./ComputerOnlineCount");

describe("ComputerOnlineCount", () => {
  test("paints the online digit with the Online status token", () => {
    const html = renderToStaticMarkup(createElement(ComputerOnlineCount, { online: 1, total: 2 }));
    const green = onlineStatusColor(mobileRenderColors);
    expect(html).toContain(`data-color="${green}"`);
    expect(html).toContain(">1<");
    expect(html).toContain("> / 2<");
    expect(html).toContain('data-accessibility-label="1 of 2 online"');
    expect(html).not.toContain('data-color="' + green + '"> / 2');
  });

  test("renders None when there are no computers", () => {
    const html = renderToStaticMarkup(createElement(ComputerOnlineCount, { online: 0, total: 0 }));
    expect(html).toContain(">None<");
    expect(html).toContain('data-accessibility-label="No computers"');
    expect(html).not.toContain(onlineStatusColor(mobileRenderColors));
  });
});
