import { describe, expect, it } from "bun:test";
import {
  buildErrorPageHtml,
  errorPageDataUrl,
  formatUnknownError,
} from "./error-page.ts";

describe("error-page", () => {
  it("escapes HTML in details and keeps content scrollable region", () => {
    const html = buildErrorPageHtml({
      title: "Boot failed",
      summary: "Could not start <Atmos>",
      details: 'line1\n<script>alert(1)</script>\nport 30303',
      logPath: "/tmp/desktop-main.log",
    });
    expect(html).toContain("Boot failed");
    expect(html).toContain("Could not start &lt;Atmos&gt;");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain('role="region"');
    expect(html).toContain("overflow: auto");
    expect(html).toContain("/tmp/desktop-main.log");
  });

  it("builds a data URL", () => {
    const url = errorPageDataUrl({
      title: "T",
      summary: "S",
      details: "D",
    });
    expect(url.startsWith("data:text/html;charset=utf-8,")).toBe(true);
    expect(decodeURIComponent(url.slice("data:text/html;charset=utf-8,".length))).toContain(
      "Atmos",
    );
  });

  it("formatUnknownError includes stack when present", () => {
    const err = new Error("boom");
    const text = formatUnknownError(err);
    expect(text).toContain("boom");
    expect(text).toContain("Error:");
  });
});
