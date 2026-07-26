// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import { formatAppshotPrompt } from "@/features/appshot/lib/appshot-protocol";
import { resolveTerminalAgentPrompt } from "../terminal-agent-input-overlay-utils";

const timestamp = "1760000000000";

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
    expect(resolved).toContain("metadata.json");
    expect(resolved).toContain("context.md");
    expect(resolved).toContain("snapshot.png");
  });

  it("leaves malformed Appshot chips untouched", async () => {
    const resolved = await resolveTerminalAgentPrompt({
      attachments: [],
      text: "See [#appshot:123]",
    });
    expect(resolved).toBe("See [#appshot:123]");
  });
});
