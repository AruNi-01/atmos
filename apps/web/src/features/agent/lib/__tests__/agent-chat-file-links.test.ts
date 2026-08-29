import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
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
    expect(source).toContain("AgentToolFileChip");
    expect(source).toContain("preview: options?.preview ?? false");
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
    expect(source).toContain("const chip = openable ?");
  });
});
