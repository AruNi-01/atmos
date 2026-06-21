export const terminalFontRegularUrl = require("../../../assets/fonts/HackNerdFontMono-Regular.ttf") as string;
export const terminalFontBoldUrl = require("../../../assets/fonts/HackNerdFontMono-Bold.ttf") as string;

export const MOBILE_TERMINAL_FONT_SIZE = 12;
export const MOBILE_TERMINAL_FONT_FAMILY =
  '"Hack Nerd Font Mono", "Hack Nerd Font", "Hack", "JetBrains Mono NL", "JetBrains Mono", "Fira Code", "SF Mono", Monaco, "Cascadia Code", Menlo, Consolas, "Liberation Mono", monospace';

const NERD_FONT_TEST_GLYPH = "\uE0B6";

let terminalFontLoadPromise: Promise<void> | null = null;

export async function ensureMobileTerminalFontsLoaded() {
  if (typeof document === "undefined" || typeof FontFace === "undefined") return;

  if (!terminalFontLoadPromise) {
    terminalFontLoadPromise = (async () => {
      const faces = [
        new FontFace("Hack Nerd Font Mono", `url("${terminalFontRegularUrl}")`, {
          style: "normal",
          weight: "400",
        }),
        new FontFace("Hack Nerd Font Mono", `url("${terminalFontBoldUrl}")`, {
          style: "normal",
          weight: "700",
        }),
        new FontFace("Hack Nerd Font", `url("${terminalFontRegularUrl}")`, {
          style: "normal",
          weight: "400",
        }),
        new FontFace("Hack Nerd Font", `url("${terminalFontBoldUrl}")`, {
          style: "normal",
          weight: "700",
        }),
      ];

      const results = await Promise.allSettled(faces.map((face) => face.load()));
      for (const result of results) {
        if (result.status === "fulfilled" && !document.fonts.has(result.value)) {
          document.fonts.add(result.value);
        }
      }

      await Promise.allSettled([
        document.fonts.load(`${MOBILE_TERMINAL_FONT_SIZE}px "Hack Nerd Font Mono"`, NERD_FONT_TEST_GLYPH),
        document.fonts.load(`${MOBILE_TERMINAL_FONT_SIZE}px "Hack Nerd Font"`, NERD_FONT_TEST_GLYPH),
        document.fonts.ready,
      ]);
    })();
  }

  return terminalFontLoadPromise;
}
