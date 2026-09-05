import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { parseAskUserQuestions } from "../ApprovalCard";

describe("ApprovalCard / AskUser questions", () => {
  test("parses Claude-style questions arrays", () => {
    const questions = parseAskUserQuestions({
      questions: [
        {
          question: "How should I format the output?",
          header: "Format",
          options: [
            { label: "Summary", description: "Brief" },
            { label: "Detailed", description: "Full" },
          ],
          multiSelect: false,
        },
      ],
    });
    expect(questions).toHaveLength(1);
    expect(questions[0]?.question).toBe("How should I format the output?");
    expect(questions[0]?.options.map((o) => o.label)).toEqual(["Summary", "Detailed"]);
  });

  test("parses nested Codex-style args.questions", () => {
    const questions = parseAskUserQuestions({
      args: {
        questions: [{ question: "Pick one?", options: ["A", "B"] }],
      },
    });
    expect(questions[0]?.options.map((o) => o.label)).toEqual(["A", "B"]);
  });

  test("AgentPermissionCard wires ApprovalCard for AskUser", () => {
    const source = readFileSync(join(import.meta.dir, "../AgentPermissionCard.tsx"), "utf8");
    expect(source).toContain("ApprovalCard");
    expect(source).toContain("onAnswerQuestions");
    expect(source).toContain("planApproveTitle");
  });
});
