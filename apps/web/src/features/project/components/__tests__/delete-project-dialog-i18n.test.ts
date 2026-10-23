import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dialog = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../DeleteProjectDialog.tsx"),
  "utf8",
);

describe("DeleteProjectDialog i18n", () => {
  test("title and body use project.deleteProjectDialog keys", () => {
    expect(dialog).toContain('useTranslations("project.deleteProjectDialog")');
    expect(dialog).toContain('t("title", { projectName })');
    expect(dialog).not.toContain("Delete {projectName}");
    expect(dialog).not.toContain("Delete ${");
    expect(dialog).not.toContain("`Delete ${");
  });
});
