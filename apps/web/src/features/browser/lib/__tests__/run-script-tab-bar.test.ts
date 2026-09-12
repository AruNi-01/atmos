import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const runScript = readFileSync(
  join(import.meta.dir, "../../components/RunScript.tsx"),
  "utf8",
);
const shared = readFileSync(
  join(import.meta.dir, "../../../../app-shell/center-stage-shared-tabs.tsx"),
  "utf8",
);

describe("run script tab bar", () => {
  it("keeps the plus after the last terminal and pinned when the strip is full", () => {
    const listBlock = shared.slice(
      shared.indexOf("export function CenterStageTabList"),
      shared.indexOf("export function CenterStageScrollableTabs"),
    );
    expect(listBlock).toContain("{children}");
    expect(listBlock).toContain("trailing={afterTabs}");

    const runList = runScript.slice(
      runScript.indexOf("<CenterStageTabList"),
      runScript.indexOf("</CenterStageTabList>"),
    );
    expect(runList).toContain("afterTabs={");
    expect(runList).toContain("<CenterStageScrollableTabs className=\"flex-initial\">");
    expect(runList).toContain("CenterStageStickyTabActions");
    expect(runList).toContain("<Plus className=\"size-3.5\" />");
  });

  it("unlocks the pinned Run terminal by swapping the tab icon on hover", () => {
    const runTabSlot = runScript.slice(
      runScript.indexOf("{isRunTab ? ("),
      runScript.indexOf("closeLabel={t(\"actions.closeTerminal\""),
    );
    expect(runTabSlot).toContain("onHoverAction");
    expect(runTabSlot).toContain("<Unlock className=\"size-3\" />");
    expect(runTabSlot).toContain("<Lock className=\"size-3\" />");
    expect(runTabSlot).toContain("unlockTerminalTooltip");
    expect(runTabSlot).not.toContain("onClose");
    expect(runScript).not.toContain("setIsLocked(!isLocked)");

    const toolbar = runScript.slice(
      runScript.indexOf('<div className="flex shrink-0 items-center gap-2 pr-2">'),
      runScript.indexOf("{/* Content */}"),
    );
    expect(toolbar).not.toContain("<Lock");
    expect(toolbar).not.toContain("<Unlock");
    expect(toolbar).not.toContain("setIsLocked");
  });

  it("ignores Cmd+R when the keep-alive host marked the panel inert", () => {
    expect(runScript).toContain('rootRef.current?.closest("[inert]")');
  });
});
