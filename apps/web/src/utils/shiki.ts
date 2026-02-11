import {
  createJavaScriptRegexEngine,
} from "shiki/engine/javascript";
import {
  type HighlighterCore,
  type RegexEngine,
  createHighlighterCore,
} from "shiki/core";

import lightTheme from "shiki/themes/github-light.mjs";
import darkTheme from "shiki/themes/github-dark.mjs";

import html from "shiki/langs/html.mjs";
import js from "shiki/langs/javascript.mjs";
import ts from "shiki/langs/typescript.mjs";
import tsx from "shiki/langs/tsx.mjs";
import jsx from "shiki/langs/jsx.mjs";
import css from "shiki/langs/css.mjs";
import json from "shiki/langs/json.mjs";
import bash from "shiki/langs/bash.mjs";
import markdown from "shiki/langs/markdown.mjs";
import python from "shiki/langs/python.mjs";
import rust from "shiki/langs/rust.mjs";
import go from "shiki/langs/go.mjs";
import java from "shiki/langs/java.mjs";
import yaml from "shiki/langs/yaml.mjs";
import toml from "shiki/langs/toml.mjs";
import sql from "shiki/langs/sql.mjs";
import shell from "shiki/langs/shellscript.mjs";
import dockerfile from "shiki/langs/dockerfile.mjs";
import cLang from "shiki/langs/c.mjs";
import cpp from "shiki/langs/cpp.mjs";

let jsEngine: RegexEngine | null = null;
let highlighter: Promise<HighlighterCore> | null = null;

const Themes = {
  light: "github-light",
  dark: "github-dark",
} as const;

const DualThemes = {
  light: Themes.light,
  dark: Themes.dark,
} as const;

type Languages =
  | "html"
  | "javascript"
  | "js"
  | "typescript"
  | "ts"
  | "tsx"
  | "jsx"
  | "css"
  | "json"
  | "bash"
  | "sh"
  | "shell"
  | "markdown"
  | "md"
  | "python"
  | "py"
  | "rust"
  | "rs"
  | "go"
  | "java"
  | "yaml"
  | "yml"
  | "toml"
  | "sql"
  | "dockerfile"
  | "c"
  | "cpp"
  | "c++";

const getJsEngine = (): RegexEngine => {
  jsEngine ??= createJavaScriptRegexEngine();
  return jsEngine;
};

const highlight = async (): Promise<HighlighterCore> => {
  highlighter ??= createHighlighterCore({
    themes: [lightTheme, darkTheme],
    langs: [
      bash,
      shell,
      js,
      ts,
      tsx,
      jsx,
      css,
      markdown,
      html,
      json,
      python,
      rust,
      go,
      java,
      yaml,
      toml,
      sql,
      dockerfile,
      cLang,
      cpp,
    ],
    engine: getJsEngine(),
  });
  return highlighter;
};

export { highlight, Themes, DualThemes, type Languages };
