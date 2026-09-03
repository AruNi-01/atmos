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

  it("does not treat Codex writeStdin copy as a shell command", () => {
    expect(
      resolvePermissionCommand({
        tool: "commandExecution",
        description: "Write to terminal",
      }),
    ).toBeNull();
  });

  it("uses Codex commandExecution markdown as the command, not the prompt copy", () => {
    const command = `/bin/zsh -c "printf 'hi' > /tmp/atmos-codex-perm.txt"`;
    expect(
      resolvePermissionCommand({
        tool: "commandExecution",
        description: "Do you want to allow writing the requested file outside the current workspace at the exact path you provided?",
        contentMarkdown: command,
      }),
    ).toBe(command);
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
    expect(permissionOptionVariant("reject_always")).toBe("ghost");
    expect(permissionOptionVariant("Reject")).toBe("ghost");
  });

  it("maps native host option kinds from the verified wire", () => {
    expect(permissionOptionVariant("allow")).toBe("default");
    expect(permissionOptionVariant("allow_once")).toBe("default");
    expect(permissionOptionVariant("acceptForSession")).toBe("secondary");
    expect(permissionOptionVariant("allow_always")).toBe("secondary");
    expect(permissionOptionVariant("decline")).toBe("ghost");
    expect(permissionOptionVariant("deny")).toBe("ghost");
    expect(permissionOptionVariant("cancel")).toBe("ghost");
    expect(permissionOptionVariant("accept")).toBe("default");
  });
});
