// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, describe, expect, it } from "bun:test";

import { formatAppshotPrompt } from "@/features/appshot/lib/appshot-protocol";
import {
  __resetAiContextPayloadsForTests,
  registerAiContextPrompt,
  wrapAiContextClipboard,
} from "@/shared/lib/ai-context-protocol";
import { resolveTerminalAgentPrompt } from "../terminal-agent-input-overlay-utils";

const timestamp = "1760000000000";

afterEach(() => {
  __resetAiContextPayloadsForTests();
});

describe("resolveTerminalAgentPrompt", () => {
  it("expands Appshot chips to the full desktop Copy protocol text", async () => {
    const resolved = await resolveTerminalAgentPrompt({
      attachments: [],
      text: `Please review [#appshot:${timestamp}] carefully`,
    });

    expect(resolved).toBe(
      `Please review ${formatAppshotPrompt(timestamp)} carefully`,
    );
    expect(resolved).toContain(`~/.atmos/appshots/records/${timestamp}/`);
  });

  it("expands AI context chips to the original prompt body", async () => {
    const body = [
      "## Preview element",
      "- **Selector**: `main > h1`",
      "### Element text",
      "Hello",
    ].join("\n");
    const token = registerAiContextPrompt("preview-element", body);

    const resolved = await resolveTerminalAgentPrompt({
      attachments: [],
      text: `Please inspect ${token}`,
    });

    expect(resolved).toBe(`Please inspect ${body}`);
  });

  it("materializes a whole-string AI context envelope from plain paste", async () => {
    const body = "Resolve merge conflicts in package-lock.json";
    const resolved = await resolveTerminalAgentPrompt({
      attachments: [],
      text: wrapAiContextClipboard("git-conflict", body),
    });
    expect(resolved).toBe(body);
  });
});
