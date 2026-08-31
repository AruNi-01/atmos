import { describe, expect, test } from "bun:test";
import {
  MD_LIVE_CODE_LANGUAGES,
  formatMdLiveCodeLangLabel,
  mdLiveCodeLanguageChoices,
  normalizeMdLiveCodeLang,
} from "../md-live-code-languages";

describe("md-live code languages", () => {
  test("lists shiki fence ids used by markdown preview", () => {
    expect(MD_LIVE_CODE_LANGUAGES).toContain("bash");
    expect(MD_LIVE_CODE_LANGUAGES).toContain("typescript");
    expect(MD_LIVE_CODE_LANGUAGES).toContain("rust");
    expect(MD_LIVE_CODE_LANGUAGES).toContain("mermaid");
    expect(MD_LIVE_CODE_LANGUAGES[0]).toBe("");
  });

  test("normalizes fence aliases to shiki langs", () => {
    expect(normalizeMdLiveCodeLang("sh")).toBe("bash");
    expect(normalizeMdLiveCodeLang("js")).toBe("javascript");
    expect(normalizeMdLiveCodeLang("TS")).toBe("typescript");
    expect(normalizeMdLiveCodeLang("")).toBe("");
  });

  test("formats language labels in sentence case with acronyms upcased", () => {
    expect(formatMdLiveCodeLangLabel("typescript", "Plain text")).toBe("TypeScript");
    expect(formatMdLiveCodeLangLabel("tsx", "Plain text")).toBe("TSX");
    expect(formatMdLiveCodeLangLabel("jsx", "Plain text")).toBe("JSX");
    expect(formatMdLiveCodeLangLabel("bash", "Plain text")).toBe("Bash");
    expect(formatMdLiveCodeLangLabel("mermaid", "Plain text")).toBe("Mermaid");
    expect(formatMdLiveCodeLangLabel("", "Plain text")).toBe("Plain text");
  });

  test("keeps an unknown current fence id in the picker", () => {
    expect(mdLiveCodeLanguageChoices("ruby")[0]).toBe("ruby");
    expect(mdLiveCodeLanguageChoices("bash")[0]).toBe("");
  });
});
