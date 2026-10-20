// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import {
  commandPermissionActions,
  commandPermissionText,
  looksLikeShellCommand,
  permissionDescriptionToRender,
  permissionMarkdownToRender,
  preferredPrimaryOptionId,
  resolvePermissionCommand,
} from "./permission-command";

const SHELL = "ls /tmp; echo ---; cat /tmp/runtime_manifest.json";

const PLAN_WITH_TABLE = `# Plan: Finish Agent Chat context-window occupancy

Locked from 'AAAA':

| Question | Decision |
| --- | --- |
| Scope | used + context_window |
| Delivery | Badge + tooltip |

Related: prior work.

---
`;

describe("resolvePermissionCommand", () => {
  test("uses the bash tool description as the command", () => {
    expect(
      resolvePermissionCommand({
        tool: "Bash",
        description: SHELL,
      }),
    ).toBe(SHELL);
  });

  test("reads a fenced command when the tool title is generic", () => {
    expect(
      resolvePermissionCommand({
        tool: "execute",
        description: "Bash",
        contentMarkdown: "```bash\nls -la\n```",
      }),
    ).toBe("ls -la");
  });

  test("treats a shell-looking description as a command even without an execute tool", () => {
    expect(
      resolvePermissionCommand({
        tool: "other",
        description: SHELL,
      }),
    ).toBe(SHELL);
  });

  test("does not treat Codex writeStdin copy as a shell command", () => {
    expect(
      resolvePermissionCommand({
        tool: "commandExecution",
        description: "Write to terminal",
      }),
    ).toBeNull();
  });

  test("uses Codex commandExecution markdown as the command, not the prompt copy", () => {
    const command = `/bin/zsh -c "printf 'hi' > /tmp/atmos-codex-perm.txt"`;
    expect(
      resolvePermissionCommand({
        tool: "commandExecution",
        description:
          "Do you want to allow writing the requested file outside the current workspace at the exact path you provided?",
        contentMarkdown: command,
      }),
    ).toBe(command);
  });

  test("does not treat ExitPlanMode plan markdown tables as a shell command", () => {
    expect(
      resolvePermissionCommand({
        tool: "ExitPlanMode",
        description: "Plan: Finish Agent Chat context-window occupancy",
        contentMarkdown: PLAN_WITH_TABLE,
      }),
    ).toBeNull();
    expect(looksLikeShellCommand(PLAN_WITH_TABLE)).toBe(false);
    expect(looksLikeShellCommand("echo hi | cat")).toBe(true);
  });
});

describe("permission display fallbacks", () => {
  test("hides the description and markdown when they only repeat the command", () => {
    expect(permissionDescriptionToRender(SHELL, SHELL)).toBeNull();
    expect(permissionMarkdownToRender(`\`\`\`bash\n${SHELL}\n\`\`\``, SHELL)).toBeNull();
    expect(permissionDescriptionToRender("Run this command", SHELL)).toBe("Run this command");
  });

  test("shows the command, then the description, then the tool name", () => {
    expect(commandPermissionText({ tool: "Bash", description: SHELL })).toBe(SHELL);
    expect(
      commandPermissionText({
        tool: "execute",
        description: "Bash",
        contentMarkdown: "```bash\nls -la\n```",
      }),
    ).toBe("ls -la");
    expect(
      commandPermissionText({ tool: "commandExecution", description: "Write to terminal" }),
    ).toBe("Write to terminal");
    expect(commandPermissionText({ tool: "customTool", description: "" })).toBe("customTool");
    expect(commandPermissionText({ tool: "", description: "" })).toBe("command");
  });
});

describe("command permission actions", () => {
  test("keeps once primary when always is listed first and never primaries reject", () => {
    expect(
      preferredPrimaryOptionId([
        { option_id: "allow_always", name: "Always" },
        { option_id: "allow_once", name: "Once" },
        { option_id: "reject_once", name: "Reject" },
      ]),
    ).toBe("allow_once");
    expect(
      commandPermissionActions([
        { option_id: "allow_always", name: "Always", kind: "allow_always" },
        { option_id: "allow_once", name: "Once", kind: "allow_once" },
        { option_id: "reject_once", name: "Reject", kind: "reject" },
      ]),
    ).toEqual([
      { id: "allow_always", label: "Always", variant: "ghost" },
      { id: "allow_once", label: "Once", variant: "primary" },
      { id: "reject_once", label: "Reject", variant: "ghost" },
    ]);
    expect(commandPermissionActions([{ option_id: "reject_once", name: "Deny" }])).toEqual([
      { id: "reject_once", label: "Deny", variant: "ghost" },
    ]);
    expect(commandPermissionActions([])).toEqual([]);
    expect(commandPermissionActions([{ option_id: "custom", name: "Custom" }])).toEqual([
      { id: "custom", label: "Custom", variant: "primary" },
    ]);
  });

  test("renders command options as glass chips on the shared permission card", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "AgentChatPermissionCard.tsx"),
      "utf8",
    );
    expect(source).toContain("GlassTextButton");
    expect(source).toContain("permissionOptionTone");
    expect(source).toContain("option.name.trim()");
    expect(source).toContain("isPlanExitRequest(request)");
    expect(source).toContain("questions.length > 0");
    expect(source).toContain('variant="card"');
    expect(source).toContain("theme.colors.secondaryLabel");
    expect(source).not.toContain("function CommandPermission");
    expect(source).not.toContain("<ApprovalShell>");
    expect(source).not.toContain("borderRadius: 12");
    expect(source).not.toContain("commandPermissionText");
  });
});
