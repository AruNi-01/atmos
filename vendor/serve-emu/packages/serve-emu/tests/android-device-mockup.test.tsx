import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AndroidDeviceMockup } from "../src/ui/components/android-device-mockup";

describe("AndroidDeviceMockup", () => {
  test("wraps children in an Android phone frame", () => {
    const markup = renderToStaticMarkup(
      <AndroidDeviceMockup deviceSize={{ width: 1080, height: 2400 }}>
        <div className="stream-surface">preview</div>
      </AndroidDeviceMockup>,
    );
    expect(markup).toContain("data-atmos-android-mockup");
    expect(markup).toContain("stream-surface");
    expect(markup).toContain("preview");
    expect(markup).toContain("android-device-mockup hide-camera");
    expect(markup).toMatch(/position:absolute[^"]*border-radius/);
  });
});
