/**
 * Staged-file gates for Husky pre-commit.
 * Keep this fast: no full monorepo lint/typecheck/test (CI owns those).
 * Commands use bun/cargo only — no `just` required.
 */
export default {
  // Format only staged Rust sources with workspace rustfmt settings.
  "*.rs": (files) =>
    files.length === 0 ? [] : [`cargo fmt -- ${files.map(quote).join(" ")}`],

  // Cheap APP-050 boundary check when shared package sources change.
  "packages/shared/**/*.{ts,tsx,js,mjs,cjs}": () => [
    "bun scripts/check-package-boundaries.ts",
  ],
};

function quote(file) {
  return `'${file.replaceAll("'", `'"'"'`)}'`;
}
