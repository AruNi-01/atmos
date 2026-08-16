import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  HISTORY_COLUMN_DEFAULTS,
  HISTORY_COLUMN_MINS,
} from "../git-history-columns";

const root = join(import.meta.dir, "../../../../../../..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("git history panel structural", () => {
  it("keeps match-case inside the search field and drops the toolbar divider", () => {
    const src = read("apps/web/src/features/git/components/GitHistoryPanel.tsx");
    expect(src).toContain("InputGroup");
    expect(src).toContain("InputGroupButton");
    expect(src).not.toMatch(
      /InputGroup className="[^"]*overflow-hidden/,
    );
    expect(src).toContain(
      "mr-1 size-5 h-5 w-5 shrink-0 rounded-md sm:size-5 sm:h-5 sm:w-5",
    );
    expect(src).not.toContain("InputGroupAddon");
    expect(src).toContain("CaseSensitive");
    expect(src).not.toMatch(
      /flex h-10 shrink-0 items-center gap-1\.5 border-b/,
    );
  });

  it("reverses the refresh icon spin while loading", () => {
    const src = read("apps/web/src/features/git/components/GitHistoryPanel.tsx");
    expect(src).toContain("animate-spin-reverse");
    expect(src).not.toMatch(
      /history\.isFetching && !history\.isFetchingNextPage && "animate-spin"/,
    );
  });

  it("renders a table header and a hover copy control on the hash", () => {
    const src = read("apps/web/src/features/git/components/GitHistoryPanel.tsx");
    expect(src).toContain("GitHistoryTableHeader");
    expect(src).toContain("t(`columns.${id}`)");
    expect(src).toContain('t("columns.commit")');
    expect(src).toContain("group/hash");
    expect(src).toContain("group-hover/hash:opacity-100");
    expect(src).toContain("justify-start gap-1");
    expect(src).toContain("rounded-md");
    expect(src).toContain("hover:bg-accent");
    expect(src).toContain("<Copy");
    expect(src).toContain("ColumnResizeHandle");
    expect(src).toContain("cursor-col-resize");
    expect(src).toContain("sticky top-0 z-30 h-0");
    expect(src).toContain("hover:after:bg-foreground/35");
    expect(src).toContain("historyColumnDividerOffsets");
    expect(src).toContain("gridTemplateColumns");
    expect(HISTORY_COLUMN_DEFAULTS.commit).toBeGreaterThan(72);
    expect(HISTORY_COLUMN_DEFAULTS.date).toBeGreaterThan(0);
    expect(HISTORY_COLUMN_DEFAULTS.author).toBeGreaterThan(0);
    expect(HISTORY_COLUMN_MINS.graph).toBeGreaterThan(historyGraphMinLaneWidth());
  });

  it("allows longer ref labels and tooltips only when truncated", () => {
    const src = read("apps/web/src/features/git/components/GitHistoryPanel.tsx");
    expect(src).toContain("max-w-56");
    expect(src).not.toContain("max-w-28");
    expect(src).toContain("open={truncated ? tooltipOpen : false}");
    expect(src).toContain("label.scrollWidth > label.clientWidth + 1");
  });

  it("opens the existing commit view in the task GitHub drawer and does not drive sidebar diffs", () => {
    const panel = read("apps/web/src/features/git/components/GitHistoryPanel.tsx");
    expect(panel).toContain("TaskGithubDrawerHost");
    expect(panel).toContain("openCommit");
    expect(panel).toContain("commitDrawerKey");
    expect(panel).toContain("onSelect={() => openCommitDrawer(commit)}");

    const changesPanel = read("apps/web/src/features/git/components/ChangesPanel.tsx");
    expect(changesPanel).not.toContain("handleSelectCommitScope(historySelectedCommit)");
    expect(changesPanel).not.toContain("historySelectedCommit");

    const drawer = read(
      "apps/web/src/features/task/components/task-github-drawer/TaskGithubDrawerHost.tsx",
    );
    expect(drawer).toContain("openCommit: (entry: Extract<TaskGithubDrawerEntry, { kind: \"commit\" }>) => void");
    expect(drawer).toContain("CommitDetailView");
  });
});

function historyGraphMinLaneWidth() {
  // One-lane graph is narrower than the header label column.
  return 40;
}
