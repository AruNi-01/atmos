import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const editorPath = join(import.meta.dir, "../CodeMirrorEditor.tsx");
const basePath = join(import.meta.dir, "../BaseCodeMirrorEditor.tsx");
const blamePath = join(import.meta.dir, "../../../../shared/lib/codemirror-git-blame.tsx");
const cardPath = join(import.meta.dir, "../../../../shared/lib/GitBlameHoverCard.tsx");
const gutterPath = join(import.meta.dir, "../../../../shared/lib/codemirror-git-gutter.ts");
const settingsPath = join(
  import.meta.dir,
  "../../../settings/components/EditorSettingsSection.tsx",
);
const storePath = join(import.meta.dir, "../../../settings/store/editor-settings-store.ts");
const enPath = join(import.meta.dir, "../../../../../messages/en.json");
const zhPath = join(import.meta.dir, "../../../../../messages/zh.json");

describe("APP-074 CodeMirror git blame wiring", () => {
  test("S2 S8 Source editor mounts current-line widget gated on gitBlame", () => {
    const editor = readFileSync(editorPath, "utf8");
    const base = readFileSync(basePath, "utf8");
    expect(editor).toContain("gitBlame={gitBlame}");
    expect(editor).toContain("t('codeMirror.settings.gitBlame')");
    expect(editor).toContain("setGitBlame");
    expect(base).toContain("createGitBlameExtensions");
    expect(base).toContain("gitBlameCompartment");
    expect(base).not.toContain("MarkdownLiveEditor");
    expect(readFileSync(blamePath, "utf8")).toContain("Decoration.widget");
    expect(readFileSync(blamePath, "utf8")).toContain("BlameEolWidget");
  });

  test("S6 S16 hover card uses popover rounding and has no divider rules", () => {
    const blame = readFileSync(blamePath, "utf8");
    const card = readFileSync(cardPath, "utf8");
    expect(blame).toContain("rounded-xl");
    expect(blame).toContain("cm-git-blame-card");
    expect(card).toContain("Avatar");
    expect(card).toContain("Button");
    expect(card).toContain("SquareArrowOutUpRight");
    expect(blame).toContain("shadow-none");
    expect(blame).toContain("Popover");
    expect(blame).toContain("PopoverAnchor");
    expect(blame).toContain("virtualRef");
    expect(blame).toContain("clientX");
    expect(blame).toContain('align="center"');
    expect(blame).not.toContain('align="start"');
    expect(blame).toContain("avoidCollisions");
    expect(blame).toContain("collisionPadding");
    expect(blame).not.toContain("overflow-visible");
    expect(blame).toContain("PopoverContent");
    expect(blame).not.toContain("hoverTooltip");
    expect(blame).toContain("GitBlameHoverCard");
    expect(blame).toContain("onMouseEnter");
    expect(blame).toContain('addEventListener("mouseenter"');
    expect(blame).toContain("elementFromPoint");
    expect(blame).toContain("relatedTarget");
    expect(blame).toContain("cm-git-blame-eol");
    expect(blame).toContain("cm-git-blame-eol-host");
    expect(blame).toContain('pointerEvents: "none"');
    expect(blame).toContain("marginLeft");
    expect(blame).not.toContain("`  ${this.text}`");
    expect(blame).not.toContain("line.from");
    expect(card).not.toContain("Separator");
    expect(card).not.toContain("border-t");
    expect(card).not.toContain("divide-y");
    expect(card).not.toContain("toastManager");
    expect(card).toContain("navigator.clipboard.writeText");
    const editor = readFileSync(editorPath, "utf8");
    expect(editor).toContain("<Switch");
    const base = readFileSync(basePath, "utf8");
    expect(base).toContain("onOpenCommit");
    expect(base).toContain("openCommitTab");
    expect(base).toContain("useOpenGitCommitCenterTab");
    expect(base).toContain("repoPath");
    expect(base).toContain("focusFilePath: gitDiffSource.fileRelativePath");
    expect(base).not.toContain("openGitHistoryTab(commit.hash)");
    expect(base).not.toContain("useOpenGithubCenterTab");
  });

  test("S11 change gutter stays independent of blame", () => {
    const gutter = readFileSync(gutterPath, "utf8");
    expect(gutter).not.toContain("gitBlame");
    expect(gutter).not.toContain("createGitBlameExtensions");
    const base = readFileSync(basePath, "utf8");
    expect(base).toContain("gitIntegration");
    expect(base).toContain("gitBlame");
  });

  test("S8 S16 Settings page and header use Switch for Git blame", () => {
    const settings = readFileSync(settingsPath, "utf8");
    expect(settings).toContain("rows.gitBlame.title");
    expect(settings).toContain("setGitBlame");
    expect(settings).toContain("<Switch");
  });

  test("S7 S9 store defaults gitBlame on and persists editor.git_blame", () => {
    const store = readFileSync(storePath, "utf8");
    expect(store).toContain("gitBlame: true");
    expect(store).toContain("settings.editor?.git_blame ?? true");
    expect(store).toContain("functionSettingsApi.update('editor', 'git_blame', gitBlame)");
  });

  test("S19 git blame is WebSocket-only", () => {
    const actions = readFileSync(
      join(import.meta.dir, "../../../../../../../packages/api-types/src/ws/actions.ts"),
      "utf8",
    );
    const contract = readFileSync(
      join(import.meta.dir, "../../../../../../../packages/api-types/src/ws/contract/git.ts"),
      "utf8",
    );
    const wsApi = readFileSync(join(import.meta.dir, "../../../../api/ws-api.ts"), "utf8");
    expect(actions).toContain('"git_file_blame"');
    expect(actions).toContain('"git_commit_detail"');
    expect(contract).toContain("git_file_blame:");
    expect(wsApi).toContain('wsRequest("git_file_blame"');
    expect(wsApi).toContain('wsRequest("git_commit_detail"');
    expect(wsApi).not.toMatch(/fetch\([^)]*git_file_blame/);
  });

  test("S15 i18n keys exist in en and zh without ALL CAPS labels", () => {
    const en = JSON.parse(readFileSync(enPath, "utf8")) as {
      Editor: { components: { codeMirror: { settings: { gitBlame: string }; gitBlame: { notCommittedYet: string } } } };
      settings: { editorSection: { rows: { gitBlame: { title: string } } } };
    };
    const zh = JSON.parse(readFileSync(zhPath, "utf8")) as typeof en;
    expect(en.Editor.components.codeMirror.settings.gitBlame).toBe("Git blame");
    expect(en.settings.editorSection.rows.gitBlame.title).toBe("Git blame");
    expect(zh.Editor.components.codeMirror.settings.gitBlame).toBe("Git 追溯");
    expect(zh.Editor.components.codeMirror.gitBlame.notCommittedYet).not.toBe(
      en.Editor.components.codeMirror.gitBlame.notCommittedYet,
    );
    expect(en.Editor.components.codeMirror.settings.gitBlame).not.toBe("GIT BLAME");
  });
});
