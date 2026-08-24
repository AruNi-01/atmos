import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const githubTable = readFileSync(
  join(import.meta.dir, "../TaskGithubTable.tsx"),
  "utf8",
);
const linearTable = readFileSync(
  join(import.meta.dir, "../TaskLinearTable.tsx"),
  "utf8",
);

describe("task table row hover", () => {
  it("uses an inset rounded hover on GitHub rows instead of a full-bleed cell fill", () => {
    const listClass = githubTable.slice(
      githubTable.indexOf('<ul className="m-0 min-h-0 min-w-0 flex-1 list-none'),
      githubTable.indexOf("{items.map((item) => {"),
    );
    expect(listClass).toContain("px-1 py-1");
    expect(listClass).not.toContain("overscroll-contain p-0");

    const rowClass = githubTable.slice(
      githubTable.indexOf("group flex min-w-0 cursor-pointer items-center gap-3"),
      githubTable.indexOf("onClick={() => onOpenItem(item)}"),
    );
    expect(rowClass).toContain("rounded-md");
    expect(rowClass).toContain("hover:bg-muted/50");
    expect(rowClass).toContain("px-2 py-2.5");
    expect(rowClass).not.toContain("px-3 py-2.5 hover:bg-muted/50");
  });

  it("uses an inset rounded hover on Linear rows instead of a full-bleed cell fill", () => {
    const listClass = linearTable.slice(
      linearTable.indexOf('<ul className="m-0 min-h-0 min-w-0 flex-1 list-none'),
      linearTable.indexOf("{issues.map((issue) => {"),
    );
    expect(listClass).toContain("px-1 py-1");
    expect(listClass).not.toContain("overscroll-contain p-0");

    const rowClass = linearTable.slice(
      linearTable.indexOf("group flex min-w-0 items-center gap-2.5 rounded-md"),
      linearTable.indexOf("onOpenIssue && \"cursor-pointer\""),
    );
    expect(rowClass).toContain("rounded-md");
    expect(rowClass).toContain("hover:bg-muted/40");
    expect(rowClass).toContain("px-2 py-2");
    expect(rowClass).not.toContain("px-3 py-2 hover:bg-muted/40");
  });

  it("uses the default highlighted variant for GitHub and Linear action buttons", () => {
    const githubAction = githubTable.slice(
      githubTable.indexOf("actionColClass, \"flex justify-end\""),
      githubTable.indexOf("<Rocket className=\"size-3.5 shrink-0\" />"),
    );
    expect(githubAction).toContain('variant="default"');
    expect(githubAction).not.toContain('variant="ghost"');
    expect(githubAction).not.toContain('variant="outline"');
    expect(githubAction).not.toContain("text-muted-foreground");

    const linearAction = linearTable.slice(
      linearTable.indexOf('actionColClass,\n                    "flex items-center justify-end"'),
      linearTable.indexOf("<Rocket className=\"size-3.5\" />"),
    );
    expect(linearAction).toContain('variant="default"');
    expect(linearAction).not.toContain('variant="ghost"');
    expect(linearAction).not.toContain("text-muted-foreground");
  });
});
