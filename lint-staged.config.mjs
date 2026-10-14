/**
 * Staged-file gates for Husky pre-commit.
 * Keep this fast: no full monorepo lint/typecheck/test (CI owns those).
 * Commands use bun/cargo only — no `just` required.
 */
export default {
  // Format only staged Rust sources with workspace rustfmt settings.
  "*.rs": (files) =>
    files.length === 0 ? [] : [`cargo fmt -- ${files.map(quote).join(" ")}`],

  // oxlint --fix then oxfmt on staged JS/TS (root .oxlintrc.jsonc / .oxfmtrc.json).
  "*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}": (files) =>
    files.length === 0
      ? []
      : [
          `oxlint --fix ${files.map(quote).join(" ")}`,
          `oxfmt ${files.map(quote).join(" ")}`,
        ],

  // Formatter-only for other oxfmt languages (no oxlint).
  "*.{css,json,jsonc,md,mdx}": (files) =>
    files.length === 0 ? [] : [`oxfmt ${files.map(quote).join(" ")}`],

  // Cheap APP-050 boundary check when shared package sources change.
  "packages/shared/**/*.{ts,tsx,js,mjs,cjs}": () => [
    "bun scripts/check-package-boundaries.ts",
  ],
};

function quote(file) {
  return `'${file.replaceAll("'", `'"'"'`)}'`;
}
