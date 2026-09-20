import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { planDocumentIntentFromMessages } from "../../lib/plan-document-intent";
import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";

describe("AgentToolPlanDocument", () => {
  it("wires plan_document kind to a transcript plan card (not PlanBlockView)", () => {
    const block = readFileSync(
      join(import.meta.dir, "../tool-results/AgentToolResultBlock.tsx"),
      "utf8",
    );
    const card = readFileSync(
      join(import.meta.dir, "../tool-results/AgentToolPlanDocument.tsx"),
      "utf8",
    );
    expect(block).toContain('part.kind === "plan_document"');
    expect(block).toContain("AgentToolPlanDocument");
    expect(card).toContain("data-agent-plan-document");
    expect(card).toContain("AgentToolTodosBody");
    expect(card).toContain("defaultOpen");
    expect(card).not.toContain("progressCount");
  });

  it("extracts structured createPlan todos for ApprovalCard planIntent", () => {
    const messages: AgentMessage[] = [
      {
        id: "a1",
        role: "assistant",
        streaming: false,
        parts: [
          {
            type: "tool_call",
            tool_call_id: "tc1",
            name: "createPlan",
            kind: "plan_document",
            status: "completed",
            params: {
              type: "plan_document",
              name: "Refactor",
              overview: "Tighten layout",
              plan: "# Refactor\n\nDo the work.",
              todos: [
                { id: "1", content: "Inspect", status: "completed" },
                { id: "2", content: "Ship", status: "pending" },
              ],
            },
          },
        ],
      },
    ];
    expect(planDocumentIntentFromMessages(messages)).toEqual({
      entries: [
        { content: "Inspect", priority: "medium", status: "completed" },
        { content: "Ship", priority: "medium", status: "pending" },
      ],
    });
  });
});
