import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { rewriteShadcnAliases } from "./rewrite-shadcn-aliases";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("rewriteShadcnAliases", () => {
  it("rewrites @/ imports to @workspace/ui package specifiers", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ui-alias-"));
    dirs.push(root);
    const file = path.join(root, "components", "motion", "demo.tsx");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(
      file,
      [
        `import { cn } from "@/lib/utils";`,
        `import { useDismiss } from "@/lib/hooks/use-dismiss";`,
        `export { Button } from "@/components/ui/button";`,
        `const lazy = () => import("@/lib/ease");`,
        "",
      ].join("\n"),
    );

    const changed = await rewriteShadcnAliases(root);
    expect(changed).toEqual([file]);
    expect(await readFile(file, "utf8")).toBe(
      [
        `import { cn } from "@workspace/ui/lib/utils";`,
        `import { useDismiss } from "@workspace/ui/lib/hooks/use-dismiss";`,
        `export { Button } from "@workspace/ui/components/ui/button";`,
        `const lazy = () => import("@workspace/ui/lib/ease");`,
        "",
      ].join("\n"),
    );
  });
});
