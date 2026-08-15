import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DeviceSidebarToggle } from "../client/components/device-sidebar-toggle";

const noop = () => {};

describe("DeviceSidebarToggle", () => {
  test("keeps the devices toggle without serve-sim branding", () => {
    const html = renderToStaticMarkup(<DeviceSidebarToggle open={false} onClick={noop} />);

    expect(html).toContain("top-3");
    expect(html).toContain("left-3");
    expect(html).toContain("z-30");
    expect(html).toContain("flex items-center");
    expect(html).not.toContain("serve-sim");
    expect(html).not.toContain("github.com");
    expect(html).not.toContain("max-[900px]:hidden");
  });
});
