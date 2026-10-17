// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import {
  PERMISSION_QUESTION_ADVANCE_MS,
  PERMISSION_QUESTION_REJECT_ID,
  permissionQuestionAnswersOptionId,
  permissionQuestionLetter,
  permissionQuestionsCanContinue,
} from "./permission-questions";

describe("permission questions", () => {
  test("matches the web ask-user payload, letter, and continue gate", () => {
    expect(PERMISSION_QUESTION_ADVANCE_MS).toBe(320);
    expect(PERMISSION_QUESTION_REJECT_ID).toBe("reject_once");
    expect(permissionQuestionLetter(0)).toBe("A");
    expect(permissionQuestionLetter(1)).toBe("B");
    expect(permissionQuestionsCanContinue([{ id: "q1" }], {})).toBe(false);
    expect(permissionQuestionsCanContinue([{ id: "q1" }], { q1: "  " })).toBe(false);
    expect(permissionQuestionsCanContinue([{ id: "q1" }, { id: "q2" }], { q1: "Yes" })).toBe(false);
    expect(
      permissionQuestionsCanContinue([{ id: "q1" }, { id: "q2" }], { q1: "Yes", q2: "No" }),
    ).toBe(true);
    expect(permissionQuestionAnswersOptionId({ q1: "Yes" })).toBe('answers:{"q1":"Yes"}');

    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "AgentChatPermissionCard.tsx"),
      "utf8",
    );
    const questions = source.slice(
      source.indexOf("function QuestionPermission"),
      source.indexOf("export function AgentChatPermissionCard"),
    );
    expect(questions).toContain("permissionQuestionAnswersOptionId");
    expect(questions).toContain("PERMISSION_QUESTION_REJECT_ID");
    expect(questions).toContain("copy.continue");
    expect(questions).toContain("copy.skip");
    expect(questions).toContain("permissionQuestionLetter");
    expect(questions).not.toContain("option.name");
    const command = source.slice(source.indexOf("export function AgentChatPermissionCard"));
    expect(command).toContain("if (questions.length > 0)");
    expect(command).toContain("QuestionPermission");
  });
});
