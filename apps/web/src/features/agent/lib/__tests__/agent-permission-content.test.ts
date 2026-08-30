import { describe, expect, it } from "bun:test";
import {
  permissionDescriptionToRender,
  permissionMarkdownToRender,
  permissionOptionVariant,
  resolvePermissionCommand,
} from "@/features/agent/lib/agent-permission-content";

const SHELL = "ls /tmp; echo ---; cat /tmp/runtime_manifest.json";

describe("resolvePermissionCommand", () => {
  it("uses the bash tool description as the command", () => {
    expect(
      resolvePermissionCommand({
        tool: "Bash",
        description: SHELL,
      }),
    ).toBe(SHELL);
  });

  it("reads a fenced command when the tool title is generic", () => {
    expect(
      resolvePermissionCommand({
        tool: "execute",
        description: "Bash",
        contentMarkdown: "```bash\nls -la\n```",
      }),
    ).toBe("ls -la");
  });

  it("treats a shell-looking description as a command even without an execute tool", () => {
    expect(
      resolvePermissionCommand({
        tool: "other",
        description: SHELL,
      }),
    ).toBe(SHELL);
  });

  it("does not treat a file-read description as a command", () => {
    expect(
      resolvePermissionCommand({
        tool: "Read",
        description: "src/lib/chat-helpers.ts",
      }),
    ).toBeNull();
  });
});

describe("permission display fallbacks", () => {
  it("hides the description and markdown when they only repeat the command", () => {
    expect(permissionDescriptionToRender(SHELL, SHELL)).toBeNull();
    expect(permissionMarkdownToRender(`\`\`\`bash\n${SHELL}\n\`\`\``, SHELL)).toBeNull();
    expect(permissionDescriptionToRender("Run this command", SHELL)).toBe("Run this command");
  });
});

describe("permissionOptionVariant", () => {
  it("highlights once, fills always, and ghosts reject", () => {
    expect(permissionOptionVariant("allow_once")).toBe("default");
    expect(permissionOptionVariant("Allow once")).toBe("default");
    expect(permissionOptionVariant("allow_always")).toBe("secondary");
    expect(permissionOptionVariant("Always allow")).toBe("secondary");
    expect(permissionOptionVariant("reject_once")).toBe("ghost");
    expect(permissionOptionVariant("Reject")).toBe("ghost");
  });
});
