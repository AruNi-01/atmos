// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import type { AgentPart, AgentTool } from "@atmos/api-types/ws/dto/agent-chat";
import { shouldShowAssistantTurnEndedChrome } from "@atmos/agent-transcript";
import {
  compactTurnTokenLabel,
  filesChangedLabel,
  filesShowMoreLabel,
  historicPermissionTitle,
  sessionChromeCopy,
  thinkingTitle,
  workedForPresentation,
  workedForVisibleKind,
} from "./copy";
import {
  collectTurnFileChanges,
  presentedTurnFileChange,
  visibleTurnFileChanges,
} from "./turn-file-changes";

const dir = dirname(fileURLToPath(import.meta.url));

function tool(part: AgentTool): AgentPart {
  return { type: "tool_call", ...part };
}

describe("assistant footer", () => {
  test("compact usage prefers total tokens and uses one decimal k", () => {
    expect(compactTurnTokenLabel({})).toBeNull();
    expect(compactTurnTokenLabel({ input_tokens: 20, output_tokens: 5 })).toBe("25");
    expect(compactTurnTokenLabel({ total_tokens: 999 })).toBe("999");
    expect(compactTurnTokenLabel({ total_tokens: 1000 })).toBe("1.0k");
    expect(compactTurnTokenLabel({ total_tokens: 1500, input_tokens: 1 })).toBe("1.5k");
  });

  test("worked-for uses the duration only when worked_ms is positive", () => {
    const completed = "2026-07-29T16:23:05Z";
    const withWork = workedForPresentation(1500, completed);
    expect(withWork.durationLabel).toBe("Worked for 1s");
    expect(withWork.clock).toBeTruthy();
    const clockOnly = workedForPresentation(0, completed);
    expect(clockOnly.durationLabel).toBeNull();
    expect(clockOnly.clock).toBe(withWork.clock);
    expect(workedForPresentation(0, "not-a-date").clock).toBeNull();
    expect(workedForVisibleKind({ hasClock: true, hasDuration: true, showDuration: false })).toBe(
      "clock",
    );
    expect(workedForVisibleKind({ hasClock: true, hasDuration: true, showDuration: true })).toBe(
      "duration",
    );
    expect(workedForVisibleKind({ hasClock: false, hasDuration: true, showDuration: false })).toBe(
      "duration",
    );
    expect(workedForVisibleKind({ hasClock: true, hasDuration: false, showDuration: true })).toBe(
      "clock",
    );
    expect(
      workedForVisibleKind({ hasClock: false, hasDuration: false, showDuration: false }),
    ).toBeNull();
    const footer = readFileSync(join(dir, "assistant-footer.tsx"), "utf8");
    expect(footer).toContain("workedForVisibleKind");
    expect(footer).toContain("WORKED_FOR_SWAP_MS = 200");
    expect(footer).toContain("setShowDuration");
  });

  test("hides ended chrome until the turn completes with text, usage, or work", () => {
    expect(
      shouldShowAssistantTurnEndedChrome(
        {
          streaming: false,
          parts: [{ type: "session_lifecycle", action: "create", status: "completed" }],
          completed_at: "t",
          worked_ms: 40,
        },
        "",
      ),
    ).toBe(false);
    expect(
      shouldShowAssistantTurnEndedChrome(
        {
          streaming: false,
          parts: [{ type: "text", text: "done" }],
          completed_at: "t",
        },
        "done",
      ),
    ).toBe(true);
  });

  test("file summary follows presentAgentTool kinds and dedupes paths", () => {
    const changes = collectTurnFileChanges([
      tool({
        tool_call_id: "edit",
        name: "Edit",
        kind: "edit",
        status: "completed",
        params: { type: "edit", path: "src/a.ts" },
        result: { type: "diff_stats", path: "src/a.ts", additions: 3, deletions: 1 },
      }),
      tool({
        tool_call_id: "edit-2",
        name: "Edit",
        kind: "edit",
        status: "completed",
        params: { type: "edit", path: "src\\a.ts" },
        result: { type: "diff_stats", path: "src\\a.ts", additions: 2, deletions: 0 },
      }),
      tool({
        tool_call_id: "diff",
        name: "Edit",
        kind: "edit",
        status: "completed",
        params: { type: "edit", path: "src/b.ts" },
        result: { type: "diff", path: "src/b.ts", old_content: "a", new_content: "b\nc" },
      }),
      tool({
        tool_call_id: "move",
        name: "Move",
        kind: "move",
        status: "completed",
        params: { type: "move", from: "src/old.ts", to: "src/new.ts" },
      }),
      tool({
        tool_call_id: "delete",
        name: "Delete",
        kind: "delete",
        status: "completed",
        params: { type: "delete", path: "src/gone.ts" },
      }),
      tool({
        tool_call_id: "patch",
        name: "Edit",
        kind: "edit",
        status: "completed",
        params: { type: "edit", path: "src/c.ts" },
        result: {
          type: "text",
          text: ["--- a/src/c.ts", "+++ b/src/c.ts", "@@ -1 +1 @@", "-old", "+new"].join("\n"),
        },
      }),
      tool({
        tool_call_id: "read",
        name: "Read",
        kind: "read",
        status: "completed",
        params: { type: "read", path: "src/read.ts" },
        result: { type: "file_content", path: "src/read.ts", text: "body" },
      }),
      tool({
        tool_call_id: "plain-code",
        name: "Edit",
        kind: "edit",
        status: "completed",
        params: { type: "edit", path: "src/plain.ts" },
        result: { type: "file_content", path: "src/plain.ts", text: "body\n" },
      }),
      { type: "text", text: "not a file" },
    ]);
    const byName = Object.fromEntries(changes.map((change) => [change.path, change]));
    expect(byName["src/a.ts"]).toEqual({ path: "src/a.ts", additions: 5, deletions: 1 });
    expect(byName["src/b.ts"]).toEqual({ path: "src/b.ts", additions: 2, deletions: 1 });
    expect(byName["src/c.ts"]).toEqual({ path: "src/c.ts", additions: 1, deletions: 1 });
    expect(byName["src/new.ts"]).toEqual({ path: "src/new.ts", additions: 0, deletions: 0 });
    expect(byName["src/gone.ts"]?.path).toBe("src/gone.ts");
    expect(byName["src/read.ts"]).toBeUndefined();
    expect(byName["src/plain.ts"]).toBeUndefined();
    expect(byName["src/old.ts"]).toBeUndefined();
    expect(
      presentedTurnFileChange({
        kind: "code",
        path: "src/created.ts",
        language: "typescript",
        code: "export const n = 1\n",
        hint: "new",
      }),
    ).toEqual({ path: "src/created.ts", additions: 1, deletions: 0 });
    expect(
      presentedTurnFileChange({
        kind: "code",
        path: "src/removed.ts",
        language: "typescript",
        code: "gone\nstill\n",
        hint: "deleted",
      }),
    ).toEqual({ path: "src/removed.ts", additions: 0, deletions: 2 });
    expect(
      presentedTurnFileChange({
        kind: "code",
        path: "src/read.ts",
        language: "typescript",
        code: "body",
      }),
    ).toBeNull();
    expect(filesChangedLabel(1)).toBe("1 file changed");
    expect(filesChangedLabel(changes.length)).toBe(`${changes.length} files changed`);
    expect(filesShowMoreLabel(2)).toBe("… Show 2 more");
    const preview = visibleTurnFileChanges(changes, false);
    expect(preview.shown).toHaveLength(3);
    expect(preview.hidden).toBe(changes.length - 3);
    expect(visibleTurnFileChanges(changes, true).shown).toHaveLength(changes.length);
  });

  test("thinking and session titles follow the web string choice", () => {
    expect(thinkingTitle(true, undefined)).toBe("Thinking...");
    expect(thinkingTitle(false, 0)).toBe("Thinking...");
    expect(thinkingTitle(false, undefined)).toBe("Thought for a few seconds");
    expect(thinkingTitle(false, 2)).toBe("Thought for 2s");
    expect(
      sessionChromeCopy({ type: "session_lifecycle", action: "create", status: "running" }).text,
    ).toBe("Creating session...");
    expect(
      sessionChromeCopy({
        type: "session_lifecycle",
        action: "resume",
        status: "completed",
        duration_ms: 2500,
      }).text,
    ).toBe("Resumed session in 2s");
    expect(
      sessionChromeCopy({
        type: "session_lifecycle",
        action: "create",
        status: "completed",
        duration_ms: 400,
      }).text,
    ).toBe("Created session");
    expect(
      sessionChromeCopy({
        type: "session_lifecycle",
        action: "resume",
        status: "failed",
        error: " timeout ",
      }),
    ).toEqual({ icon: "resume", text: "Failed to resume session: timeout", tone: "failed" });
    expect(
      sessionChromeCopy({
        type: "session_config_change",
        model: { from: "a", to: "b" },
      }).icon,
    ).toBe("model");
    expect(
      sessionChromeCopy({
        type: "session_config_change",
        model: { to: "opus" },
        mode: { to: "plan" },
      }).text,
    ).toBe("Switched model to opus · mode to plan");
    expect(
      sessionChromeCopy({ type: "session_hint", tone: "warning", kind: "model_switch_failed" }),
    ).toEqual({
      icon: "hint",
      text: "Couldn't switch model in this session",
      tone: "warning",
    });
    expect(historicPermissionTitle({ questions: [{ id: "q" }] })).toBe("Questions for you");
    expect(historicPermissionTitle({ tool: "ExitPlanMode", description: "" })).toBe("Plan ready");
    expect(historicPermissionTitle({ tool: "Bash", description: "ls" })).toBe(
      "Permission requested",
    );
    expect(historicPermissionTitle({ tool: "Bash", description: "ls" })).not.toBe(
      "Permission needed",
    );
  });

  test("answer, error, and permission views follow the transcript rules", () => {
    const answer = readFileSync(join(dir, "answer-text.tsx"), "utf8");
    expect(answer).toContain("copy.answerCaret");
    expect(answer).toContain("foldedPartIsStreamingDisplayTail");
    expect(answer).toContain("answerShowsBlockCaret");
    expect(answer).toContain("`${paced} ${copy.answerCaret}`");
    expect(answer).toContain("fontSize={14}");
    expect(answer).toContain("lineHeight={20}");
    expect(answer).toContain("if (!part.text) return null");
    expect(answer).not.toContain("\\u258b");
    const error = readFileSync(join(dir, "error-part.tsx"), "utf8");
    expect(error).toContain("redSurface");
    expect(error).toContain("redBorder");
    expect(error).toContain("TriangleAlert");
    expect(error).toContain("if (!part.message) return null");
    const permission = readFileSync(join(dir, "historic-permission.tsx"), "utf8");
    expect(permission).toContain('part.request.status === "pending"');
    expect(permission).toContain("cardElevated");
    expect(permission).toContain("glassBorder");
    expect(permission).toContain("borderRadius: 16");
    expect(permission).not.toContain("Permission needed");
    const session = readFileSync(join(dir, "session-chrome.tsx"), "utf8");
    expect(session).toContain("MessageCircleMore");
    expect(session).toContain("MessageCirclePlus");
    expect(session).toContain("Box");
    expect(session).toContain("Layers");
    expect(session).toContain("TriangleAlert");
    expect(session).toContain("size={14}");
  });
});
