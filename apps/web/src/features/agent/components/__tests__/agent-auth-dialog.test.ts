import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dialog = readFileSync(
  join(import.meta.dir, "../AgentAuthDialog.tsx"),
  "utf8",
);

describe("agent auth dialog", () => {
  it("does not preselect a method or highlight the first row", () => {
    expect(dialog).not.toContain("methods[0]");
    expect(dialog).not.toContain("border-primary");
    expect(dialog).toContain("selectMethod(method.id)");
    expect(dialog).toContain("aria-expanded={expanded}");
    expect(dialog).toContain('variant="outline"');
  });

  it("shows a browser form after choosing the method, then authenticates", () => {
    expect(dialog).toContain("catalogAuthMethodKind");
    expect(dialog).toContain('kind === "browser"');
    expect(dialog).toContain("authDialog.openBrowser");
    expect(dialog).toContain("void finishAuth(method.id)");
    expect(dialog).toContain("AUTHENTICATED_HOLD_MS");
    expect(dialog).toContain("authDialog.authenticated");
    expect(dialog).toContain("refreshSelectedAgentAfterAuth(result.refresh)");
    expect(dialog).not.toContain("common.continue");
  });

  it("shows an API key form on the token method instead of opening a browser", () => {
    expect(dialog).toContain('kind === "token"');
    expect(dialog).toContain("authDialog.apiKeyLabel");
    expect(dialog).toContain("void finishAuth(method.id, apiKey.trim())");
    expect(dialog).toContain("common.save");
  });

  it("shows a terminal command form on the CLI method", () => {
    expect(dialog).toContain('kind === "cli"');
    expect(dialog).toContain("authDialog.cliCommandLabel");
    expect(dialog).toContain("authDialog.signedIn");
  });
});
