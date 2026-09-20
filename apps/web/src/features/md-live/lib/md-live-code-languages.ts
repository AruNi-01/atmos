/** Fence ids that match the Shiki langs loaded for Markdown preview. */
export const MD_LIVE_CODE_LANGUAGES = [
  "",
  "bash",
  "javascript",
  "typescript",
  "tsx",
  "jsx",
  "python",
  "rust",
  "go",
  "java",
  "html",
  "css",
  "json",
  "yaml",
  "toml",
  "markdown",
  "mermaid",
  "sql",
  "dockerfile",
  "c",
  "cpp",
] as const;

export type MdLiveCodeLanguageId = (typeof MD_LIVE_CODE_LANGUAGES)[number];

export const MD_LIVE_CODE_LANG_ALIASES: Record<string, string> = {
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  js: "javascript",
  ts: "typescript",
  py: "python",
  rs: "rust",
  yml: "yaml",
  "c++": "cpp",
  md: "markdown",
};

export const MD_LIVE_CODE_LANG_TO_EXT: Record<string, string> = {
  javascript: "js",
  typescript: "ts",
  tsx: "tsx",
  jsx: "jsx",
  python: "py",
  rust: "rs",
  bash: "sh",
  shellscript: "sh",
  markdown: "md",
  yaml: "yml",
  toml: "toml",
  json: "json",
  html: "html",
  css: "css",
  go: "go",
  java: "java",
  sql: "sql",
  dockerfile: "dockerfile",
  c: "c",
  cpp: "cpp",
};

export function normalizeMdLiveCodeLang(lang: string): string {
  const lower = lang.trim().toLowerCase();
  if (!lower) return "";
  return MD_LIVE_CODE_LANG_ALIASES[lower] ?? lower;
}

export function mdLiveCodeLanguageChoices(current: string): string[] {
  const normalized = normalizeMdLiveCodeLang(current);
  if (normalized && !MD_LIVE_CODE_LANGUAGES.includes(normalized as MdLiveCodeLanguageId)) {
    return [normalized, ...MD_LIVE_CODE_LANGUAGES];
  }
  return [...MD_LIVE_CODE_LANGUAGES];
}

const CODE_LANG_LABELS: Record<string, string> = {
  bash: "Bash",
  javascript: "JavaScript",
  typescript: "TypeScript",
  tsx: "TSX",
  jsx: "JSX",
  python: "Python",
  rust: "Rust",
  go: "Go",
  java: "Java",
  html: "HTML",
  css: "CSS",
  json: "JSON",
  yaml: "YAML",
  toml: "TOML",
  markdown: "Markdown",
  mermaid: "Mermaid",
  sql: "SQL",
  dockerfile: "Dockerfile",
  c: "C",
  cpp: "C++",
};

export function formatMdLiveCodeLangLabel(id: string, plainLabel: string): string {
  if (!id) return plainLabel;
  const normalized = normalizeMdLiveCodeLang(id);
  return CODE_LANG_LABELS[normalized] ?? (normalized.charAt(0).toUpperCase() + normalized.slice(1));
}
