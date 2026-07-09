// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import {
  buildAgentFixPointerPrompt,
  buildAgentFixPromptFilePath,
  shouldUseAgentFixPromptFile,
} from "@/features/agent-fix/lib/agent-fix-prompt-file";

describe("shouldUseAgentFixPromptFile", () => {
  it("keeps short prompts inline", () => {
    expect(shouldUseAgentFixPromptFile("Fix the failing test.")).toBe(false);
  });

  it("uses a file for prompts over the character limit", () => {
    expect(shouldUseAgentFixPromptFile("x".repeat(601))).toBe(true);
  });

  it("uses a file for prompts with many lines", () => {
    expect(shouldUseAgentFixPromptFile(Array(12).fill("line").join("\n"))).toBe(true);
  });
});

describe("buildAgentFixPromptFilePath", () => {
  it("places the file under .atmos/tmp/agent-fix", () => {
    expect(buildAgentFixPromptFilePath("/repo/workspace/", 1234)).toBe(
      "/repo/workspace/.atmos/tmp/agent-fix/fix_1234.md",
    );
  });
});

describe("buildAgentFixPointerPrompt", () => {
  it("references the prompt file and stays single-purpose", () => {
    const pointer = buildAgentFixPointerPrompt("/repo/.atmos/tmp/agent-fix/fix_1.md");
    expect(pointer).toContain("/repo/.atmos/tmp/agent-fix/fix_1.md");
    expect(shouldUseAgentFixPromptFile(pointer)).toBe(false);
  });
});
