import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  agentChatPathLooksLikeDirectory,
  classifyAgentChatHref,
  displayAgentChatFilePath,
  resolveAgentChatOpenableFile,
  resolveAgentChatWorkspaceFile,
} from "@/features/agent/lib/agent-chat-file-links";

const cwd = "/Users/me/project";
const workspace = "/Users/me/workspace";

describe("resolveAgentChatWorkspaceFile", () => {
  it("resolves relative and absolute paths under the chat cwd", () => {
    expect(resolveAgentChatWorkspaceFile("src/app.ts", cwd)).toEqual({
      path: `${cwd}/src/app.ts`,
    });
    expect(resolveAgentChatWorkspaceFile(`${cwd}/README.md`, cwd)).toEqual({
      path: `${cwd}/README.md`,
    });
    expect(resolveAgentChatWorkspaceFile("package.json", cwd)).toEqual({
      path: `${cwd}/package.json`,
    });
  });

  it("parses line numbers and file:// URLs", () => {
    expect(resolveAgentChatWorkspaceFile("src/app.ts:12", cwd)).toEqual({
      path: `${cwd}/src/app.ts`,
      line: 12,
    });
    expect(resolveAgentChatWorkspaceFile("src/app.ts#L8", cwd)).toEqual({
      path: `${cwd}/src/app.ts`,
      line: 8,
    });
    expect(resolveAgentChatWorkspaceFile(`file://${cwd}/src/app.ts`, cwd)).toEqual({
      path: `${cwd}/src/app.ts`,
    });
  });

  it("rejects paths outside the current project or workspace", () => {
    expect(resolveAgentChatWorkspaceFile("../secret", cwd)).toBeNull();
    expect(resolveAgentChatWorkspaceFile("/etc/passwd", cwd)).toBeNull();
    expect(resolveAgentChatWorkspaceFile("/Users/me/other/src/app.ts", cwd)).toBeNull();
    expect(resolveAgentChatWorkspaceFile(`file:///tmp/app.ts`, cwd)).toBeNull();
    expect(resolveAgentChatWorkspaceFile("https://example.com/a.ts", cwd)).toBeNull();
    expect(resolveAgentChatWorkspaceFile("npm", cwd)).toBeNull();
    expect(resolveAgentChatWorkspaceFile("git status", cwd)).toBeNull();
    expect(resolveAgentChatWorkspaceFile("contextTokensUsed", cwd)).toBeNull();
    expect(resolveAgentChatWorkspaceFile("_meta.totalTokens", cwd)).toBeNull();
    expect(resolveAgentChatWorkspaceFile("/context", cwd)).toBeNull();
    expect(resolveAgentChatWorkspaceFile(
      "signals.json",
      "/Users/me/.grok/sessions/abc",
      [cwd],
    )).toBeNull();
    expect(resolveAgentChatWorkspaceFile(
      "chat_history.jsonl",
      "/Users/me/.grok/sessions/abc",
      [cwd],
    )).toBeNull();
  });

  it("allows files under an extra project or workspace root", () => {
    expect(resolveAgentChatWorkspaceFile(
      `${workspace}/crates/agent/src/lib.rs`,
      `${workspace}/apps/web`,
      [workspace],
    )).toEqual({
      path: `${workspace}/crates/agent/src/lib.rs`,
    });
    expect(resolveAgentChatOpenableFile(
      `${workspace}/crates/agent/src/lib.rs`,
      `${workspace}/apps/web`,
      [workspace],
    )).toEqual({
      path: `${workspace}/crates/agent/src/lib.rs`,
    });
  });
});

describe("resolveAgentChatOpenableFile", () => {
  it("opens known tool paths under the current project", () => {
    expect(resolveAgentChatOpenableFile("src", cwd)).toEqual({
      path: `${cwd}/src`,
    });
    expect(resolveAgentChatOpenableFile(`${cwd}/README`, cwd)).toEqual({
      path: `${cwd}/README`,
    });
  });

  it("leaves paths outside the current project or workspace unopenable", () => {
    expect(resolveAgentChatOpenableFile("/etc/passwd", cwd)).toBeNull();
    expect(resolveAgentChatOpenableFile("/Users/me/other/src/app.ts", cwd)).toBeNull();
    expect(resolveAgentChatOpenableFile("/tmp/app.ts", cwd, [workspace])).toBeNull();
  });
});

describe("displayAgentChatFilePath", () => {
  it("shows a relative path for files in the current project or workspace", () => {
    expect(displayAgentChatFilePath("src/app.ts", cwd)).toBe("src/app.ts");
    expect(displayAgentChatFilePath(`${cwd}/src/app.ts`, cwd)).toBe("src/app.ts");
    expect(displayAgentChatFilePath(`${cwd}/package.json`, cwd)).toBe("package.json");
    expect(displayAgentChatFilePath(
      `${workspace}/crates/agent/src/lib.rs`,
      `${workspace}/apps/web`,
      [workspace],
    )).toBe("crates/agent/src/lib.rs");
    expect(displayAgentChatFilePath(
      `${workspace}/apps/web/src/app.ts`,
      `${workspace}/apps/web`,
      [workspace],
    )).toBe("src/app.ts");
  });

  it("shows an absolute path for files outside the current project or workspace", () => {
    expect(displayAgentChatFilePath("/etc/passwd", cwd)).toBe("/etc/passwd");
    expect(displayAgentChatFilePath("/Users/me/other/src/app.ts", cwd)).toBe("/Users/me/other/src/app.ts");
    expect(displayAgentChatFilePath("file:///tmp/app.ts", cwd)).toBe("/tmp/app.ts");
  });
});

describe("agentChatPathLooksLikeDirectory", () => {
  it("treats extensionless and trailing-slash paths as directories", () => {
    expect(agentChatPathLooksLikeDirectory("src/features/agent")).toBe(true);
    expect(agentChatPathLooksLikeDirectory("src/features/agent/")).toBe(true);
    expect(agentChatPathLooksLikeDirectory("src")).toBe(true);
    expect(agentChatPathLooksLikeDirectory("src/app.ts")).toBe(false);
    expect(agentChatPathLooksLikeDirectory("package.json")).toBe(false);
    expect(agentChatPathLooksLikeDirectory("Dockerfile")).toBe(true);
  });
});

describe("classifyAgentChatHref", () => {
  it("opens workspace file hrefs and keeps http links", () => {
    expect(classifyAgentChatHref("src/app.ts", cwd)).toEqual({
      kind: "workspace",
      file: { path: `${cwd}/src/app.ts` },
    });
    expect(classifyAgentChatHref("https://example.com/a.ts", cwd)).toEqual({
      kind: "external",
    });
    expect(classifyAgentChatHref("#section", cwd)).toEqual({
      kind: "external",
    });
  });

  it("renders file hrefs outside the current project or workspace as plain text", () => {
    expect(classifyAgentChatHref("/etc/passwd", cwd)).toEqual({ kind: "plain" });
    expect(classifyAgentChatHref("/Users/me/other/src/app.ts", cwd)).toEqual({ kind: "plain" });
    expect(classifyAgentChatHref("file:///tmp/app.ts", cwd)).toEqual({ kind: "plain" });
  });
});

describe("agent chat file-link wiring", () => {
  it("opens workspace files from assistant markdown like tool-result chips", () => {
    const source = readFileSync(
      join(import.meta.dir, "../../components/AssistantMessageView.tsx"),
      "utf8",
    );
    expect(source).toContain("classifyAgentChatHref");
    expect(source).toContain("resolveAgentChatWorkspaceFile");
    expect(source).toContain("AgentChatMarkdownFileChip");
    expect(source).toContain("AgentChatMarkdownFileLink");
    expect(source).not.toContain("AgentToolFileChip");
    expect(source).toContain("useOpenAgentChatWorkspacePath");
    expect(source).toContain('classified.kind === "plain"');
  });

  it("only turns current project or workspace tool files into buttons", () => {
    const source = readFileSync(
      join(import.meta.dir, "../../components/tool-results/AgentToolCard.tsx"),
      "utf8",
    );
    expect(source).toContain("resolveAgentChatOpenableFile");
    expect(source).toContain("displayAgentChatFilePath");
    expect(source).toContain("TooltipContent");
    expect(source).toContain("const chip = clickable ?");
    expect(source).toContain("isDir={isDir}");
    expect(source).toContain("useAgentChatResolvedPathKind");
  });

  it("reveals directories in the files tab instead of opening them as files", () => {
    const hook = readFileSync(
      join(import.meta.dir, "../../hooks/use-open-agent-chat-path.ts"),
      "utf8",
    );
    expect(hook).toContain("requestFileTreeReveal");
    expect(hook).toContain("FILES_TAB_VALUE");
    expect(hook).toContain('kind === "directory"');
    expect(hook).toContain("resolveAgentChatPathKind");
    expect(hook).toContain('if (kind !== "file") return');
    const kindSource = readFileSync(
      join(import.meta.dir, "../agent-chat-path-kind.ts"),
      "utf8",
    );
    expect(kindSource).toContain("lookupPathInFileTrees");
    expect(kindSource).toContain("collectCachedFileTrees");
    expect(kindSource).toContain('fromTree === "absent"');
  });

  it("keeps original markdown path text and underlines existing files on hover", () => {
    const source = readFileSync(
      join(import.meta.dir, "../../components/AgentChatMarkdownFile.tsx"),
      "utf8",
    );
    expect(source).toContain("useAgentChatResolvedPathKind");
    expect(source).toContain('kind !== "file" && kind !== "directory"');
    expect(source).toContain("MarkdownCodeBlock");
    expect(source).toContain("{raw}");
    expect(source).toContain("decoration-dashed");
    expect(source).toContain("hover:underline");
    expect(source).not.toContain("AgentToolFileChip");
  });
});
