// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import { rewriteRelativeImports } from "../lib/document-script-host";

describe("rewriteRelativeImports", () => {
  const map = new Map<string, string>([
    ["helper.js", "blob:helper"],
    ["lib/util.js", "blob:util"],
  ]);

  it("rewrites static from and side-effect imports", () => {
    const src = `
import './helper.js'
import { x } from './helper.js'
export { y } from './lib/util.js'
`;
    const out = rewriteRelativeImports(src, "main.js", map);
    expect(out).toContain("import 'blob:helper'");
    expect(out).toContain("from 'blob:helper'");
    expect(out).toContain("from 'blob:util'");
  });

  it("rewrites dynamic import with single and double quotes", () => {
    expect(rewriteRelativeImports(`import('./helper.js')`, "main.js", map)).toBe(
      "import('blob:helper')",
    );
    expect(rewriteRelativeImports(`import("./helper.js")`, "main.js", map)).toBe(
      'import("blob:helper")',
    );
  });

  it("rewrites dynamic import with literal backtick template", () => {
    const src = "const m = await import(`./helper.js`)";
    const out = rewriteRelativeImports(src, "main.js", map);
    expect(out).toBe("const m = await import(`blob:helper`)");
  });

  it("does not rewrite interpolating template imports", () => {
    const src = "import(`./${name}.js`)";
    expect(rewriteRelativeImports(src, "main.js", map)).toBe(src);
  });

  it("does not rewrite import-like text inside strings", () => {
    const src = `const s = "import('./helper.js')"`;
    expect(rewriteRelativeImports(src, "main.js", map)).toBe(src);
  });
});
