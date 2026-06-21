import type { TerminalThemeTokens } from "@atmos/shared/terminal";
import { terminalFontBoldUrl, terminalFontRegularUrl } from "@/features/terminal/mobile-terminal-fonts";

export function buildTerminalDomCss(theme: TerminalThemeTokens) {
  return `
    html, body, #root {
      background: ${theme.background};
      height: 100%;
      margin: 0;
      overflow: hidden;
      width: 100%;
    }
    @font-face {
      font-family: "Hack Nerd Font Mono";
      font-style: normal;
      font-weight: 400;
      src: url("${terminalFontRegularUrl}") format("truetype");
    }
    @font-face {
      font-family: "Hack Nerd Font Mono";
      font-style: normal;
      font-weight: 700;
      src: url("${terminalFontBoldUrl}") format("truetype");
    }
    @font-face {
      font-family: "Hack Nerd Font";
      font-style: normal;
      font-weight: 400;
      src: url("${terminalFontRegularUrl}") format("truetype");
    }
    @font-face {
      font-family: "Hack Nerd Font";
      font-style: normal;
      font-weight: 700;
      src: url("${terminalFontBoldUrl}") format("truetype");
    }
    * { box-sizing: border-box; }
    .shell {
      background: ${theme.background};
      height: 100%;
      overflow: hidden;
      padding: 8px 6px;
      position: relative;
      width: 100%;
    }
    .terminal {
      caret-color: ${theme.cursor};
      height: 100%;
      touch-action: manipulation;
      width: 100%;
    }
    .xterm {
      background: ${theme.background} !important;
      caret-color: ${theme.cursor};
      font-feature-settings: "liga" 0;
      height: 100%;
      padding: 0 !important;
      -webkit-font-smoothing: antialiased;
    }
    .xterm .xterm-helper-textarea {
      caret-color: ${theme.cursor} !important;
    }
    .xterm-viewport {
      background: ${theme.background} !important;
      overflow-y: hidden !important;
      overscroll-behavior: contain;
    }
    .xterm-screen {
      background: ${theme.background} !important;
      padding: 0 !important;
    }
    .xterm-scrollable-element {
      overscroll-behavior: contain;
      position: relative;
    }
    .xterm-scrollable-element > .scrollbar.vertical,
    .xterm-scrollable-element > .visible.scrollbar.vertical,
    .xterm-scrollable-element > .invisible.scrollbar.vertical {
      bottom: 0 !important;
      left: auto !important;
      position: absolute !important;
      right: 0 !important;
      top: 0 !important;
    }
    .xterm .xterm-scroll-area ~ .xterm-decoration-container + div,
    .xterm-scrollbar,
    .xterm .scrollbar {
      opacity: 0.6 !important;
      right: 2px !important;
      transition: opacity 0.2s ease, width 0.2s ease !important;
      width: 6px !important;
    }
    .xterm .xterm-scroll-area ~ .xterm-decoration-container + div > div,
    .xterm-scrollbar > div,
    .xterm .scrollbar.vertical > div.slider,
    .xterm .invisible.scrollbar > div {
      background: rgba(161, 161, 170, 0.34) !important;
      border-radius: 9999px !important;
      opacity: 1 !important;
      transition: opacity 0.2s ease !important;
      width: 6px !important;
    }
    .status {
      align-items: center;
      backdrop-filter: blur(16px);
      background: ${theme.background}cc;
      color: #fca5a5;
      display: flex;
      font: 600 13px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
      inset: 0;
      justify-content: center;
      letter-spacing: 0;
      pointer-events: none;
      position: absolute;
    }
  `;
}
