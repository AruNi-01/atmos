export function isMarkdownPatchCode(code: string): boolean {
  return /^@@\s[+-]/m.test(code) && (
    code.includes('--- ') || code.includes('diff --git ')
  );
}
