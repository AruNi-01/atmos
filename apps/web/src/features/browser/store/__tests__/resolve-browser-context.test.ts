import { describe, expect, it } from "bun:test";

import { resolveBrowserContext } from "../resolve-browser-context";

const panels = {
  sidebar: { isActive: false },
  center: { isActive: false },
};

const bySession = {
  "sess-side": { contextId: "sidebar" },
  "sess-center": { contextId: "center" },
};

describe("resolveBrowserContext", () => {
  it("uses an explicit target even when another panel is active", () => {
    const routed = resolveBrowserContext({
      targetSessionId: "sess-side",
      preferredSessionId: "sess-center",
      panels: { sidebar: { isActive: false }, center: { isActive: true } },
      bySession,
    });
    expect(routed).toEqual({ ok: true, contextId: "sidebar" });
  });

  it("follows the unique UI-active Browser the user is using", () => {
    const routed = resolveBrowserContext({
      preferredSessionId: "sess-side",
      panels: { sidebar: { isActive: false }, center: { isActive: true } },
      bySession,
    });
    expect(routed).toEqual({ ok: true, contextId: "center" });
  });

  it("falls back to last-active when no panel is UI-active", () => {
    const routed = resolveBrowserContext({
      preferredSessionId: "sess-side",
      panels,
      bySession,
    });
    expect(routed).toEqual({ ok: true, contextId: "sidebar" });
  });

  it("uses last-active to break a tie when several panels are UI-active", () => {
    const routed = resolveBrowserContext({
      preferredSessionId: "sess-center",
      panels: { sidebar: { isActive: true }, center: { isActive: true } },
      bySession,
    });
    expect(routed).toEqual({ ok: true, contextId: "center" });
  });

  it("is ambiguous when several unused panels have no last-active hint", () => {
    const routed = resolveBrowserContext({
      panels,
      bySession,
    });
    expect(routed.ok).toBe(false);
    expect(routed.error_code).toBe("browser_ambiguous_target");
  });
});
