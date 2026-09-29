// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { collapsedToolTitle, wireToolKind } from "./tool-kind";

describe("wireToolKind", () => {
  test("keeps a known kind", () => {
    expect(wireToolKind("execute")).toBe("execute");
    expect(wireToolKind("plan_document")).toBe("plan_document");
    expect(wireToolKind("other")).toBe("other");
  });

  test("unknown kinds become other", () => {
    expect(wireToolKind("not-a-kind")).toBe("other");
    expect(wireToolKind("")).toBe("other");
    expect(wireToolKind(null)).toBe("other");
    expect(wireToolKind(undefined)).toBe("other");
  });

  test("collapsed title keeps a human heading and skips a command echo", () => {
    expect(collapsedToolTitle({
      type: "tool_call",
      tool_call_id: "t",
      name: "run_terminal_command",
      title: "Typecheck files-related web sources",
      kind: "execute",
      status: "completed",
      params: { type: "execute", command: "cd apps/web && bunx tsc --noEmit", background: false },
    })).toBe("Typecheck files-related web sources");
    expect(collapsedToolTitle({
      type: "tool_call",
      tool_call_id: "t",
      name: "`ls`",
      title: "Execute `ls`",
      kind: "execute",
      status: "completed",
      params: { type: "execute", command: "ls", background: false },
    })).toBe("Run Script");
  });
});
