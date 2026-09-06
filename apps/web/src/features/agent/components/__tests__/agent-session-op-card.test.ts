import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const card = readFileSync(
  join(import.meta.dir, "../AgentSessionOpCard.tsx"),
  "utf8",
);

describe("APP-069 S9 agent session-op card", () => {
  it("reuses confirmation chrome and i18n keys", () => {
    expect(card).toContain("Confirmation");
    expect(card).toContain("ConfirmationRequest");
    expect(card).toContain("ConfirmationActions");
    expect(card).toContain('useTranslations("Agent.components.chatPanel")');
    expect(card).toContain('t("sessionOpRequested")');
    expect(card).toContain('t(request.kind === "fork" ? "sessionOpFork" : "sessionOpRewind")');
    expect(card).not.toContain("uppercase");
    expect(card).not.toMatch(/SESSION OP|FORK|REWIND/);
  });

  it("renders backend session-op chrome labels and option ids (Grok worktree, two-phase rewind)", () => {
    expect(card).toContain("request.options.map");
    expect(card).toContain("label={opt.name}");
    expect(card).toContain("onClick={() => onRespond(opt.option_id)}");
    expect(card).toContain("request.title.trim()");
    expect(card).not.toContain("Fork with worktree");
    expect(card).not.toContain("Restore conversation");
  });

  it("does not assume Claude two-phase rewind ids for Codex turn: chrome", () => {
    expect(card).not.toContain("rewind_conversation");
    expect(card).not.toContain("rewind_code");
    expect(card).toContain("onRespond(opt.option_id)");
  });
});
