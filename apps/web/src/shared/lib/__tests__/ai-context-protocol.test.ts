// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, describe, expect, it } from "bun:test";

import {
  __resetAiContextPayloadsForTests,
  agentFixSourceToAiContextKind,
  expandAiContextTokens,
  materializeAiContextText,
  parseAiContextProtocol,
  parseAiContextToken,
  presentAiContextChip,
  registerAiContextPrompt,
  selectionTypeToAiContextKind,
  wrapAiContextClipboard,
} from "../ai-context-protocol";

afterEach(() => {
  __resetAiContextPayloadsForTests();
});

const codeBody = [
  "## Code snippet",
  "- **File**: `src/app.ts`",
  "- **Lines**: L10-L20",
  "",
  "```ts",
  "const x = 1;",
  "```",
].join("\n");

describe("ai-context protocol", () => {
  it("wraps and parses clipboard envelopes for every selection type", () => {
    for (const type of ["editor", "diff", "wiki", "preview"] as const) {
      const kind = selectionTypeToAiContextKind(type);
      const clipboard = wrapAiContextClipboard(kind, codeBody);
      expect(clipboard.startsWith(`atmos://context/${kind}\n`)).toBe(true);
      const parsed = parseAiContextProtocol(clipboard);
      expect(parsed).toEqual({ kind, promptText: codeBody });
    }
  });

  it("does not double-wrap the same kind", () => {
    const once = wrapAiContextClipboard("code-selection", codeBody);
    expect(wrapAiContextClipboard("code-selection", once)).toBe(once);
  });

  it("re-wraps when kind changes", () => {
    const asCode = wrapAiContextClipboard("code-selection", codeBody);
    const asDiff = wrapAiContextClipboard("diff-selection", asCode);
    expect(asDiff.startsWith("atmos://context/diff-selection\n")).toBe(true);
    expect(parseAiContextProtocol(asDiff)?.promptText).toBe(codeBody);
  });

  it("registers chip tokens that expand to the exact body", () => {
    const token = registerAiContextPrompt("preview-element", codeBody);
    expect(parseAiContextToken(token)?.kind).toBe("preview-element");
    expect(expandAiContextTokens(`Review ${token}`)).toBe(`Review ${codeBody}`);
    expect(materializeAiContextText(token)).toBe(codeBody);
  });

  it("materializes a whole-string clipboard envelope without tokens", () => {
    const clipboard = wrapAiContextClipboard("git-conflict", "Please resolve conflicts.");
    expect(materializeAiContextText(clipboard)).toBe("Please resolve conflicts.");
  });

  it("derives useful chip labels from structured bodies", () => {
    const presentation = presentAiContextChip("code-selection", codeBody);
    expect(presentation.label).toContain("app.ts");
    expect(presentation.icon).toBe("code");
  });

  it("wraps Prototype Design copy-prompt as a context chip", () => {
    const body = [
      "The live Prototype Design board is already open on this computer.",
      "Read ~/.atmos/skills/.system/atmos-pt-design-agent/SKILL.md and follow it.",
    ].join("\n");
    const clipboard = wrapAiContextClipboard("pt-design-agent", body);
    expect(clipboard.startsWith("atmos://context/pt-design-agent\n")).toBe(true);
    expect(parseAiContextProtocol(clipboard)).toEqual({
      kind: "pt-design-agent",
      promptText: body,
    });
    expect(presentAiContextChip("pt-design-agent", body).label).toBe("Prototype");
  });

  it("maps agent-fix sources to specific kinds", () => {
    expect(
      agentFixSourceToAiContextKind({ id: "diff-stashed:ws", family: "diff" }),
    ).toBe("diff-prompt-stash");
    expect(agentFixSourceToAiContextKind({ id: "diff:file", family: "diff" })).toBe(
      "diff-selection",
    );
    expect(
      agentFixSourceToAiContextKind({ id: "review", family: "review_session" }),
    ).toBe("review-run");
    expect(agentFixSourceToAiContextKind({ id: "x", family: "custom" })).toBe(
      "agent-fix",
    );
  });

  it("rejects non-protocol text", () => {
    expect(parseAiContextProtocol("## Code snippet\n- **File**: `a.ts`")).toBeNull();
    expect(parseAiContextProtocol("atmos://context/unknown-kind\nbody")).toBeNull();
  });
});
