"use client";

import React from "react";
import { createPortal } from "react-dom";
import { createTranslator } from "next-intl";
import { cn, getFileIconProps } from "@workspace/ui";
import { parseAppshotProtocol } from "@/features/appshot/lib/appshot-protocol";
import {
  formatSideChatProtocol,
  formatSpawnProtocol,
  formatTerminalSelectionProtocol,
  parseSideChatProtocolToken,
  parseSpawnProtocolToken,
  parseTerminalSelectionProtocolToken,
} from "@/features/terminal/lib/terminal-ai-context-protocol";
import {
  formatSkillDisableProtocol,
  parseSkillDisableProtocolToken,
  skillDisableSessionCounts,
  skillDisableSessionNameLists,
  stripSkillDisableSession,
  type SkillDisableSessionAction,
} from "@/features/skills/lib/skill-disable-protocol";
import {
  parseAiContextProtocol,
  parseAiContextToken,
  presentAiContextChip,
  registerAiContextPrompt,
  resolveAiContextPrompt,
  type AiContextChipIcon,
  type AiContextChipTone,
} from "@/shared/lib/ai-context-protocol";
import { currentAppLocale } from "@/shared/lib/current-app-locale";
import enMessages from "../../../../messages/en.json";
import zhMessages from "../../../../messages/zh.json";

export type MentionRef =
  | { kind: "issue" | "pr"; number: number }
  | { kind: "file"; relativePath: string }
  | { kind: "skill"; absolutePath: string; name: string }
  | { kind: "side"; contextId: string };

export interface AtTriggerContext {
  caretRect: DOMRect;
  query: string;
  atOffset: number;
}

export interface SlashTriggerContext {
  caretRect: DOMRect;
  query: string;
  slashOffset: number;
}

export interface ComposerHandle {
  getText: () => string;
  setText: (text: string) => void;
  clear: () => void;
  insertMention: (mention: MentionRef) => void;
  insertFileMention: (relativePath: string) => void;
  /**
   * Replace the `@<query>` slice (computed via popover at-context) with the
   * mention chip + a trailing space, then place the caret right after the space
   * so the user can keep typing.
   */
  applyMentionAtRange: (atOffset: number, queryLength: number, mention: MentionRef) => void;
  /**
   * Replace the `/<query>` slice (computed via popover slash-context) with the
   * mention chip + a trailing space, then place the caret right after the space
   * so the user can keep typing.
   */
  applySlashAtRange: (slashOffset: number, queryLength: number, mention: MentionRef) => void;
  /**
   * Remove the `/<query>` slice without inserting a chip. Used by slash actions
   * that update surrounding composer state instead of becoming prompt tokens.
   */
  removeSlashAtRange: (slashOffset: number, queryLength: number) => void;
  insertTerminalSelectionContext: (contextId: string) => void;
  insertSideChatCommand: (contextId: string) => void;
  applySideCommandAtRange: (slashOffset: number, queryLength: number, contextId: string) => void;
  insertSpawnCommand: (contextId: string) => void;
  applySpawnCommandAtRange: (slashOffset: number, queryLength: number, contextId: string) => void;
  applySkillDisableCommandAtRange: (slashOffset: number, queryLength: number) => void;
  /** Focus the in-chip filter field while the disable popover is open. */
  focusSkillDisableFilter: () => void;
  /** Replace in-chip session action pills (enable/disable results this session). */
  setSkillDisableSessionActions: (actions: SkillDisableSessionAction[]) => void;
  /** Leave the chip filter, place caret after the chip, then auto-remove after N seconds. */
  beginSkillDisableChipDismiss: (seconds: number) => void;
  /** Replace skill-disable chip with a fresh `/` for returning to slash menu. */
  restoreSlashFromSkillDisable: () => void;
  /** Drop skill-disable chip immediately. */
  clearSkillDisableSession: () => void;
  removeContextToken: (contextId: string) => void;
  insertImagePlaceholder: (n: number) => void;
  removeImagePlaceholder: (n: number) => void;
  focus: () => void;
  placeCaretAtClientPoint: (clientX: number, clientY: number) => boolean;
}

export interface ComposerCallbacks {
  onTextChange?: (text: string) => void;
  onImagePaste?: (blob: Blob, ext: string) => void;
  onAtTrigger?: (ctx: AtTriggerContext) => void;
  onAtCancel?: () => void;
  onSlashTrigger?: (ctx: SlashTriggerContext) => void;
  onSlashCancel?: () => void;
  onSkillDisableFilterChange?: (filter: string) => void;
  /** Fired when the skill-disable chip is removed (e.g. empty-filter double Delete). */
  onSkillDisableSessionClosed?: () => void;
}

interface PromptComposerProps extends ComposerCallbacks {
  className?: string;
  editorClassName?: string;
  placeholderClassName?: string;
  placeholder?: React.ReactNode;
  onSubmit?: () => void;
}

const CHIP_TOKEN_PATTERN =
  String.raw`@(?:issue|pr)#\d+|@file:[^\s]+|\/skill:[^\s]+|atmos:\/\/terminal-selection\/[a-zA-Z0-9_.:-]+|atmos:\/\/side-chat\/[a-zA-Z0-9_.:-]+|atmos:\/\/spawn\/[a-zA-Z0-9_.:-]+|atmos:\/\/skill-disable|\[#img-\d+\]|\[#appshot:\d{13}\]|\[#ctx:[a-z0-9-]+:[a-zA-Z0-9_-]+\]`;
const TOKEN_REGEX = new RegExp(`(${CHIP_TOKEN_PATTERN})`, "g");
const BACKSPACE_CHIP_REGEX = new RegExp(`(${CHIP_TOKEN_PATTERN})\\u00A0?$`);
const DELETE_CHIP_REGEX = new RegExp(`^(${CHIP_TOKEN_PATTERN})\\u00A0?`);
const CHIP_TRAILING_SPACER = "\u00A0";
const TRAILING_CHIP_SPACER_REGEX = new RegExp(`(${CHIP_TOKEN_PATTERN})([ \\u00A0]+)$`);

let cachedPromptComposerLocale: "en" | "zh" | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedPromptComposerTranslator: any = null;

function promptComposerT(key: string, values?: Record<string, string | number | Date>): string {
  const locale = currentAppLocale("en") === "zh" ? "zh" : "en";
  if (!cachedPromptComposerTranslator || cachedPromptComposerLocale !== locale) {
    cachedPromptComposerLocale = locale;
    cachedPromptComposerTranslator = createTranslator({
      locale,
      messages: locale === "zh" ? zhMessages : enMessages,
      namespace: "terminal.agentInput",
    });
  }
  return cachedPromptComposerTranslator(key as never, values as never);
}

/**
 * Most SVG icons used inside chips live as static assets under
 * `apps/web/public/icons/`. They are rendered via CSS mask so they inherit
 * `currentColor` for theme support (`<img src>` would lose the stroke color).
 */
function buildMaskIcon(url: string): HTMLSpanElement {
  const icon = document.createElement("span");
  icon.setAttribute("aria-hidden", "true");
  icon.style.cssText = [
    "display:inline-block",
    "width:12px",
    "height:12px",
    "background-color:currentColor",
    `mask-image:url('${url}')`,
    `-webkit-mask-image:url('${url}')`,
    "mask-size:contain",
    "-webkit-mask-size:contain",
    "mask-repeat:no-repeat",
    "-webkit-mask-repeat:no-repeat",
    "mask-position:center",
    "-webkit-mask-position:center",
  ].join(";");
  return icon;
}

function buildMessageCirclePlusIcon(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "13");
  svg.setAttribute("height", "13");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.style.flexShrink = "0";

  for (const d of [
    "M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719",
    "M8 12h8",
    "M12 8v8",
  ]) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }

  return svg;
}

function buildMessageCircleMoreIcon(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "13");
  svg.setAttribute("height", "13");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.style.flexShrink = "0";

  for (const d of [
    "M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719",
    "M8 12h.01",
    "M12 12h.01",
    "M16 12h.01",
  ]) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }

  return svg;
}

function buildMessagesSquareIcon(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "13");
  svg.setAttribute("height", "13");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.style.flexShrink = "0";

  for (const d of [
    "M14 9a2 2 0 0 1-2 2H6l-4 4V4c0-1.1.9-2 2-2h8a2 2 0 0 1 2 2Z",
    "M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1",
  ]) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }

  return svg;
}

/** Mirrors `BrowserUseIconStatic` for contenteditable skill chips. */
function buildBrowserUseChipIcon(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "13");
  svg.setAttribute("height", "13");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.style.flexShrink = "0";

  for (const d of [
    "M12 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9",
    "M2 8h10",
    "M6 4v4",
    "M10 4v4",
  ]) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute("transform", "translate(23.4 2.0) scale(-0.45 0.45)");
  for (const d of [
    "M14 4.1 12 6",
    "m5.1 8-2.9-.8",
    "m6 12-1.9 2",
    "M7.2 2.2 8 5.1",
    "M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z",
  ]) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    if (!d.startsWith("M9.037")) path.setAttribute("opacity", "0.9");
    g.appendChild(path);
  }
  svg.appendChild(g);
  return svg;
}

/** Mirrors `DesktopUseIconStatic` for contenteditable skill chips. */
function buildDesktopUseChipIcon(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "13");
  svg.setAttribute("height", "13");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.style.flexShrink = "0";

  for (const d of ["M13 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3", "M8 21h8", "M12 17v4"]) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute("transform", "translate(22.6 0.2) scale(-0.48 0.48)");
  for (const d of [
    "M14 4.1 12 6",
    "m5.1 8-2.9-.8",
    "m6 12-1.9 2",
    "M7.2 2.2 8 5.1",
    "M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z",
  ]) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    if (!d.startsWith("M9.037")) path.setAttribute("opacity", "0.9");
    g.appendChild(path);
  }
  svg.appendChild(g);
  return svg;
}

function buildStrokeIcon(paths: string[]): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "13");
  svg.setAttribute("height", "13");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.style.flexShrink = "0";
  for (const d of paths) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}

/** Lucide path sets used by unified AI-context chips. */
function buildAiContextIcon(icon: AiContextChipIcon): SVGSVGElement {
  switch (icon) {
    case "code":
      return buildStrokeIcon(["m16 18 6-6-6-6", "m8 6-6 6 6 6"]);
    case "diff":
      return buildStrokeIcon([
        "M12 3v14",
        "m7 8 5-5 5 5",
        "M5 21h14",
        "M9 17h6",
      ]);
    case "book":
      return buildStrokeIcon([
        "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20",
      ]);
    case "mouse-pointer-click":
      return buildStrokeIcon([
        "M14 4.1 12 6",
        "m5.1 8-2.9-.8",
        "m6 12-1.9 2",
        "M7.2 2.2 8 5.1",
        "M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z",
      ]);
    case "terminal":
      return buildStrokeIcon(["m4 17 6-6-6-6", "M12 19h8"]);
    case "layers":
      return buildStrokeIcon([
        "m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z",
        "m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65",
        "m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65",
      ]);
    case "wrench":
      return buildStrokeIcon([
        "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z",
      ]);
    case "scan":
      return buildStrokeIcon([
        "M3 7V5a2 2 0 0 1 2-2h2",
        "M17 3h2a2 2 0 0 1 2 2v2",
        "M21 17v2a2 2 0 0 1-2 2h-2",
        "M7 21H5a2 2 0 0 1-2-2v-2",
        "M7 12h10",
      ]);
    case "git-merge":
      return buildStrokeIcon([
        "M15 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
        "M6 6a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
        "M6 21V9a9 9 0 0 0 9 9",
      ]);
    case "layout":
      return buildStrokeIcon([
        "M3 3h7v9H3z",
        "M14 3h7v5h-7z",
        "M14 12h7v9h-7z",
        "M3 16h7v5H3z",
      ]);
  }
}

function aiContextToneClassName(tone: AiContextChipTone): string {
  switch (tone) {
    case "violet":
      return " border-violet-500/35 bg-violet-500/10 text-violet-700 dark:text-violet-300";
    case "blue":
      return " border-blue-500/35 bg-blue-500/10 text-blue-700 dark:text-blue-300";
    case "amber":
      return " border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-300";
    case "emerald":
      return " border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "cyan":
      return " border-cyan-500/35 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300";
    case "rose":
      return " border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300";
    case "orange":
      return " border-orange-500/35 bg-orange-500/10 text-orange-700 dark:text-orange-300";
    case "indigo":
      return " border-indigo-500/35 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300";
    case "fuchsia":
      return " border-fuchsia-500/35 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300";
    case "slate":
      return " border-slate-500/35 bg-slate-500/10 text-slate-700 dark:text-slate-300";
  }
}

function tokenForMention(mention: MentionRef): string {
  if (mention.kind === "file") {
    return `@file:${mention.relativePath}`;
  }
  if (mention.kind === "skill") {
    return `/skill:${mention.absolutePath}`;
  }
  if (mention.kind === "side") {
    return formatSideChatProtocol(mention.contextId);
  }
  return `@${mention.kind}#${mention.number}`;
}

function buildChipNode(token: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.setAttribute("data-token", token);
  span.setAttribute("contenteditable", "false");
  // Vertically tight: no padding, line-height matches the editor's caret so the
  // chip sits flush with the surrounding text without the bordered box towering
  // above/below the caret line.
  span.className =
    "inline-flex select-none items-center gap-1 rounded-md border px-1.5 py-px text-[12px] leading-[18px] font-medium align-middle mx-[1px]";

  if (token.startsWith("@issue#")) {
    span.dataset.kind = "issue";
    const n = token.split("#")[1];
    span.dataset.tooltip = `Issue #${n}`;
    span.className += " border-border/70 bg-muted/60 text-foreground";
    span.appendChild(buildMaskIcon("/icons/circle-dot.svg"));
    const label = document.createElement("span");
    label.textContent = `#${n}`;
    span.appendChild(label);
  } else if (token.startsWith("@pr#")) {
    span.dataset.kind = "pr";
    const n = token.split("#")[1];
    span.dataset.tooltip = `PR #${n}`;
    span.className += " border-border/70 bg-muted/60 text-foreground";
    span.appendChild(buildMaskIcon("/icons/git-pull-request-arrow.svg"));
    const label = document.createElement("span");
    label.textContent = `#${n}`;
    span.appendChild(label);
  } else if (token.startsWith("@file:")) {
    const relativePath = token.slice("@file:".length);
    const filename = relativePath.split("/").pop() || relativePath;
    const isDir = relativePath.endsWith("/");
    span.dataset.tooltip = relativePath;
    span.className += " border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400";
    const iconProps = getFileIconProps({ name: filename, isDir, className: "size-3.5" });
    const icon = document.createElement("img");
    icon.src = iconProps.src;
    icon.alt = iconProps.alt ?? "";
    if (iconProps.className) icon.className = iconProps.className;
    span.appendChild(icon);
    const label = document.createElement("span");
    label.textContent = filename;
    span.appendChild(label);
  } else if (token.startsWith("/skill:")) {
    span.dataset.kind = "skill";
    const absolutePath = token.slice("/skill:".length);
    const filename = absolutePath.split("/").pop() || absolutePath;
    span.dataset.tooltip = absolutePath;
    const isBrowserUse = absolutePath.includes("atmos-browser-use");
    const isDesktopUse = absolutePath.includes("atmos-desktop-use");
    if (isBrowserUse) {
      span.className += " border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300";
      span.appendChild(buildBrowserUseChipIcon());
    } else if (isDesktopUse) {
      span.className +=
        " border-violet-500/35 bg-violet-500/10 text-violet-700 dark:text-violet-300";
      span.appendChild(buildDesktopUseChipIcon());
    } else {
      span.className +=
        " border-yellow-500/30 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400";
      span.appendChild(buildMaskIcon("/icons/puzzle.svg"));
    }
    const label = document.createElement("span");
    label.textContent = filename;
    span.appendChild(label);
  } else if (parseTerminalSelectionProtocolToken(token)) {
    span.dataset.kind = "terminal-selection";
    span.dataset.tooltip = promptComposerT("selectionContext.selectionTooltip");
    span.className += " border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    span.appendChild(buildMessageCircleMoreIcon());
    const label = document.createElement("span");
    label.textContent = promptComposerT("selectionContext.selectionChip");
    span.appendChild(label);
  } else if (parseSideChatProtocolToken(token)) {
    span.dataset.kind = "side";
    span.dataset.tooltip = promptComposerT("sideCommand.description");
    span.className += " border-cyan-500/35 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300";
    span.appendChild(buildMessageCirclePlusIcon());
    const label = document.createElement("span");
    label.textContent = promptComposerT("selectionContext.sideChip");
    span.appendChild(label);
  } else if (parseSpawnProtocolToken(token)) {
    span.dataset.kind = "spawn";
    span.dataset.tooltip = promptComposerT("spawnCommand.description");
    span.className += " border-green-500/35 bg-green-500/10 text-green-700 dark:text-green-400";
    span.appendChild(buildMessagesSquareIcon());
    const label = document.createElement("span");
    label.textContent = promptComposerT("selectionContext.spawnChip");
    span.appendChild(label);
  } else if (parseSkillDisableProtocolToken(token)) {
    span.dataset.kind = "skill-disable";
    span.dataset.tooltip = promptComposerT("skillDisable.chipTooltip");
    span.className +=
      " max-w-full flex-wrap border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300";
    span.appendChild(buildMaskIcon("/icons/puzzle.svg"));
    const label = document.createElement("span");
    label.dataset.sdLabel = "true";
    label.textContent = promptComposerT("skillDisable.chip");
    span.appendChild(label);
    const actions = document.createElement("span");
    actions.dataset.sdActions = "true";
    actions.className = "inline-flex max-w-full flex-wrap items-center gap-1";
    span.appendChild(actions);
    const filter = document.createElement("span");
    filter.dataset.sdFilter = "true";
    filter.setAttribute("contenteditable", "true");
    filter.setAttribute("role", "textbox");
    filter.setAttribute("aria-label", promptComposerT("skillDisable.filterAria"));
    filter.className =
      "min-w-[1ch] max-w-[12rem] truncate outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-red-700/45 dark:empty:before:text-red-300/45";
    filter.dataset.placeholder = promptComposerT("skillDisable.filterPlaceholder");
    span.appendChild(filter);
    const countdown = document.createElement("span");
    countdown.dataset.sdCountdown = "true";
    countdown.hidden = true;
    countdown.className = "px-0.5 text-[10px] font-semibold tabular-nums text-red-700/80 dark:text-red-300/80";
    span.appendChild(countdown);
  } else if (token.startsWith("[#img-")) {
    span.dataset.kind = "img";
    span.className += " border-border/70 bg-muted/60 text-foreground";
    span.textContent = token.replace(/[\[\]]/g, "");
  } else if (token.startsWith("[#appshot:")) {
    span.dataset.kind = "appshot";
    const timestamp = token.slice("[#appshot:".length, -1);
    span.dataset.tooltip = `Appshot ${timestamp}`;
    span.className += " border-success/30 bg-success/10 text-success";
    span.appendChild(buildMaskIcon("/icons/camera.svg"));
    const label = document.createElement("span");
    label.textContent = `Appshot · ${timestamp}`;
    span.appendChild(label);
  } else if (parseAiContextToken(token)) {
    const parsed = parseAiContextToken(token)!;
    const payload = resolveAiContextPrompt(token);
    const presentation = presentAiContextChip(
      parsed.kind,
      payload?.promptText ?? "",
    );
    span.dataset.kind = `ai-context:${parsed.kind}`;
    span.dataset.tooltip = presentation.tooltip;
    span.className += aiContextToneClassName(presentation.tone);
    span.appendChild(buildAiContextIcon(presentation.icon));
    const label = document.createElement("span");
    label.textContent = presentation.label;
    span.appendChild(label);
  }
  return span;
}

function serialize(root: HTMLElement): string {
  let out = "";
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tok = el.getAttribute("data-token");
      if (tok) {
        out += tok;
        return;
      }
      if (el.tagName === "BR") {
        out += "\n";
        return;
      }
      if (el.tagName === "DIV" || el.tagName === "P") {
        if (out.length > 0 && !out.endsWith("\n")) out += "\n";
        el.childNodes.forEach(walk);
        return;
      }
      el.childNodes.forEach(walk);
    }
  };
  root.childNodes.forEach(walk);
  return out;
}

function serializeRange(range: Range): string {
  const container = document.createElement("div");
  container.appendChild(range.cloneContents());
  return serialize(container);
}

function getCaretTextOffset(root: HTMLElement): number | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!range.collapsed || !root.contains(range.startContainer)) return null;

  const beforeRange = range.cloneRange();
  beforeRange.selectNodeContents(root);
  beforeRange.setEnd(range.startContainer, range.startOffset);
  return serializeRange(beforeRange).length;
}

function getChipBoundaryTextOffset(
  root: HTMLElement,
  direction: "backward" | "forward",
): number | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!range.collapsed || !root.contains(range.startContainer)) return null;

  const start =
    range.startContainer.nodeType === Node.ELEMENT_NODE
      ? (range.startContainer as Element)
      : range.startContainer.parentElement;
  const chip = start?.closest?.("[data-token]") as HTMLElement | null;
  if (!chip || !root.contains(chip)) return null;

  const beforeRange = document.createRange();
  beforeRange.selectNodeContents(root);
  if (direction === "backward") {
    beforeRange.setEndAfter(chip);
  } else {
    beforeRange.setEndBefore(chip);
  }
  return serializeRange(beforeRange).length;
}

function deleteChipNearCaret(root: HTMLElement, direction: "backward" | "forward"): boolean {
  const caretOffset = getChipBoundaryTextOffset(root, direction) ?? getCaretTextOffset(root);
  if (caretOffset === null) return false;

  const currentText = serialize(root);
  const before = currentText.slice(0, caretOffset);
  const after = currentText.slice(caretOffset);
  if (direction === "backward" && TRAILING_CHIP_SPACER_REGEX.test(before)) {
    const nextText = currentText.slice(0, caretOffset - 1) + currentText.slice(caretOffset);
    inflateInto(root, nextText);
    setCaretAtTextOffset(root, caretOffset - 1);
    return true;
  }
  const match =
    direction === "backward"
      ? before.match(BACKSPACE_CHIP_REGEX)
      : after.match(DELETE_CHIP_REGEX);
  if (!match?.[0]) return false;

  const deleteStart = direction === "backward"
    ? caretOffset - match[0].length
    : caretOffset;
  const deleteEnd = direction === "backward"
    ? caretOffset
    : caretOffset + match[0].length;
  const nextText = currentText.slice(0, deleteStart) + currentText.slice(deleteEnd);

  inflateInto(root, nextText);
  setCaretAtTextOffset(root, deleteStart);
  return true;
}

function inflateInto(root: HTMLElement, text: string) {
  root.innerHTML = "";
  const lines = text.split("\n");
  lines.forEach((line, idx) => {
    if (idx > 0) {
      root.appendChild(document.createElement("br"));
    }
    let last = 0;
    line.replace(TOKEN_REGEX, (match, _g, offset) => {
      if (offset > last) {
        root.appendChild(document.createTextNode(line.slice(last, offset)));
      }
      root.appendChild(buildChipNode(match));
      last = offset + match.length;
      return match;
    });
    if (last < line.length) {
      root.appendChild(document.createTextNode(line.slice(last)));
    }
  });
}

/**
 * Place the selection caret at the given text offset measured by the same
 * counting rules as `serialize`: text nodes count their characters, chip
 * elements count their data-token length, BR counts as 1 newline.
 */
function setCaretAtTextOffset(root: HTMLElement, target: number) {
  let remaining = target;
  let placed = false;

  const placeAtTextNode = (node: Text, offset: number) => {
    const range = document.createRange();
    range.setStart(node, Math.min(offset, node.length));
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    placed = true;
  };

  const placeAfter = (node: Node) => {
    const range = document.createRange();
    range.setStartAfter(node);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    placed = true;
  };

  const walk = (node: Node) => {
    if (placed) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node as Text;
      const len = text.length;
      if (remaining <= len) {
        placeAtTextNode(text, remaining);
        return;
      }
      remaining -= len;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tok = el.getAttribute("data-token");
    if (tok) {
      if (remaining <= tok.length) {
        placeAfter(el);
        return;
      }
      remaining -= tok.length;
      return;
    }
    if (el.tagName === "BR") {
      if (remaining === 0) {
        const range = document.createRange();
        range.setStartBefore(el);
        range.collapse(true);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        placed = true;
        return;
      }
      remaining -= 1;
      return;
    }
    el.childNodes.forEach(walk);
  };

  root.childNodes.forEach(walk);

  if (!placed) {
    const range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }
}

function setCaretAtClientPoint(root: HTMLElement, clientX: number, clientY: number): boolean {
  const documentWithCaret = root.ownerDocument as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  let range: Range | null = null;

  const position = documentWithCaret.caretPositionFromPoint?.(clientX, clientY);
  if (position && root.contains(position.offsetNode)) {
    range = root.ownerDocument.createRange();
    range.setStart(position.offsetNode, position.offset);
    range.collapse(true);
  }

  if (!range) {
    const pointRange = documentWithCaret.caretRangeFromPoint?.(clientX, clientY);
    if (pointRange && root.contains(pointRange.startContainer)) {
      range = pointRange;
      range.collapse(true);
    }
  }

  if (!range) {
    const rect = root.getBoundingClientRect();
    const isInsideRoot =
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom;
    if (!isInsideRoot) return false;
    setCaretAtTextOffset(root, serialize(root).length);
    return true;
  }

  const selection = root.ownerDocument.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  return true;
}

function measureCaretRect(root: HTMLElement): DOMRect {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return root.getBoundingClientRect();
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) return root.getBoundingClientRect();

  const marker = document.createElement("span");
  marker.style.cssText = "display:inline-block;width:0;height:1em;vertical-align:baseline;";
  const cloned = range.cloneRange();
  cloned.insertNode(marker);
  const rect = marker.getBoundingClientRect();
  const parent = marker.parentNode;
  const resetRange = document.createRange();
  resetRange.setStartAfter(marker);
  resetRange.collapse(true);
  if (parent) parent.removeChild(marker);
  sel.removeAllRanges();
  sel.addRange(resetRange);

  if (rect.width === 0 && rect.height === 0) {
    return root.getBoundingClientRect();
  }
  return rect;
}


function readAtContextFromSelection(root: HTMLElement): AtTriggerContext | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;

  // Use DOM toString() to reliably detect the @ trigger and extract the query.
  const beforeRange = range.cloneRange();
  beforeRange.selectNodeContents(root);
  beforeRange.setEnd(range.endContainer, range.endOffset);
  const beforeDomText = beforeRange.toString();
  const domAtIndex = beforeDomText.lastIndexOf("@");
  if (domAtIndex < 0) return null;

  const query = beforeDomText.slice(domAtIndex + 1);
  if (/\s/.test(query)) return null;

  // Find the atOffset in serialize() space so applyMentionAtRange slices correctly.
  const beforeSerializedText = serializeRange(beforeRange);
  const serializeAtIndex = beforeSerializedText.lastIndexOf("@");
  if (serializeAtIndex < 0) return null;

  const rect = measureCaretRect(root);
  return { caretRect: rect, query, atOffset: serializeAtIndex + 1 };
}

function readSlashContextFromSelection(root: HTMLElement): SlashTriggerContext | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;

  // Use DOM toString() to reliably detect the / trigger and extract the query.
  const beforeRange = range.cloneRange();
  beforeRange.selectNodeContents(root);
  beforeRange.setEnd(range.endContainer, range.endOffset);
  const beforeDomText = beforeRange.toString();
  const domAtIndex = beforeDomText.lastIndexOf("/");
  if (domAtIndex < 0) return null;

  const activeMentionStart = beforeDomText.lastIndexOf("@");
  if (
    activeMentionStart >= 0 &&
    activeMentionStart < domAtIndex &&
    !/\s/.test(beforeDomText.slice(activeMentionStart + 1))
  ) {
    return null;
  }

  const query = beforeDomText.slice(domAtIndex + 1);
  if (/\s/.test(query)) return null;

  // Find the slashOffset in serialize() space so applySlashAtRange slices correctly.
  const beforeSerializedText = serializeRange(beforeRange);
  const serializeAtIndex = beforeSerializedText.lastIndexOf("/");
  if (serializeAtIndex < 0) return null;

  const rect = measureCaretRect(root);
  return { caretRect: rect, query, slashOffset: serializeAtIndex + 1 };
}

function findSkillDisableChip(root: HTMLElement | null): HTMLElement | null {
  if (!root) return null;
  return root.querySelector('[data-token][data-kind="skill-disable"]');
}

function findSkillDisableFilter(chip: HTMLElement | null): HTMLElement | null {
  if (!chip) return null;
  return chip.querySelector("[data-sd-filter]");
}

function isInsideSkillDisableFilter(node: Node | null): boolean {
  if (!node) return false;
  const el =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;
  return Boolean(el?.closest?.("[data-sd-filter]"));
}

function focusSkillDisableFilterElement(filter: HTMLElement) {
  filter.focus();
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(filter);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function isSkillDisableFilterEmpty(filter: HTMLElement): boolean {
  return (filter.textContent ?? "").replace(/[\u00A0\s]/g, "").length === 0;
}

function placeCaretAfterNode(root: HTMLElement, node: Node) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  root.focus();
}

function placeCaretAtRemovedNode(root: HTMLElement, node: Node) {
  const parent = node.parentNode;
  const next = node.nextSibling;
  node.parentNode?.removeChild(node);
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  if (next && root.contains(next)) {
    range.setStartBefore(next);
  } else if (parent && root.contains(parent)) {
    range.selectNodeContents(parent);
    range.collapse(false);
  } else {
    range.selectNodeContents(root);
    range.collapse(false);
  }
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  root.focus();
}

function formatSkillDisableSessionTooltip(actions: SkillDisableSessionAction[]): string {
  const { enabled, disabled } = skillDisableSessionNameLists(actions);
  const lines: string[] = [];
  if (enabled.length > 0) {
    lines.push(
      promptComposerT("skillDisable.tooltipEnabled", { names: enabled.join(", ") }),
    );
  }
  if (disabled.length > 0) {
    lines.push(
      promptComposerT("skillDisable.tooltipDisabled", { names: disabled.join(", ") }),
    );
  }
  if (lines.length === 0) {
    return promptComposerT("skillDisable.chipTooltip");
  }
  return lines.join("\n");
}

function renderSkillDisableSessionActions(
  chip: HTMLElement,
  actions: SkillDisableSessionAction[],
) {
  const container = chip.querySelector("[data-sd-actions]");
  if (!container) return;
  container.replaceChildren();
  const { enabled, disabled } = skillDisableSessionCounts(actions);
  if (enabled > 0) {
    const pill = document.createElement("span");
    pill.className =
      "inline-flex items-center rounded-md border border-emerald-500/35 bg-emerald-500/10 px-1.5 py-px text-[10px] font-semibold tabular-nums text-emerald-700 dark:text-emerald-300";
    pill.textContent = `+${enabled}`;
    container.appendChild(pill);
  }
  if (disabled > 0) {
    const pill = document.createElement("span");
    pill.className =
      "inline-flex items-center rounded-md border border-red-500/40 bg-red-500/15 px-1.5 py-px text-[10px] font-semibold tabular-nums text-red-700 dark:text-red-300";
    pill.textContent = `-${disabled}`;
    container.appendChild(pill);
  }
  chip.dataset.tooltip = formatSkillDisableSessionTooltip(actions);
}

export const PromptComposer = React.forwardRef<ComposerHandle, PromptComposerProps>(
  function PromptComposer(props, ref) {
    const {
      onTextChange,
      onImagePaste,
      onAtTrigger,
      onAtCancel,
      onSlashTrigger,
      onSlashCancel,
      onSkillDisableFilterChange,
      onSkillDisableSessionClosed,
      className,
      editorClassName,
      placeholder,
      placeholderClassName,
      onSubmit,
    } = props;
    const editorRef = React.useRef<HTMLDivElement | null>(null);
    const skillDisableDismissTimerRef = React.useRef<number | null>(null);
    const skillDisableDismissStateRef = React.useRef<{
      chip: HTMLElement;
      left: number;
      paused: boolean;
    } | null>(null);
    const onSkillDisableFilterChangeRef = React.useRef(onSkillDisableFilterChange);
    onSkillDisableFilterChangeRef.current = onSkillDisableFilterChange;
    const onSkillDisableSessionClosedRef = React.useRef(onSkillDisableSessionClosed);
    onSkillDisableSessionClosedRef.current = onSkillDisableSessionClosed;
    const [isEmpty, setIsEmpty] = React.useState(true);
    const [chipTooltip, setChipTooltip] = React.useState<{
      text: string;
      top: number;
      left: number;
    } | null>(null);
    const savedCaretOffsetRef = React.useRef<number | null>(null);

    const clearSkillDisableDismissTimer = React.useCallback(() => {
      if (skillDisableDismissTimerRef.current != null) {
        window.clearInterval(skillDisableDismissTimerRef.current);
        skillDisableDismissTimerRef.current = null;
      }
    }, []);

    const clearSkillDisableDismiss = React.useCallback(() => {
      clearSkillDisableDismissTimer();
      skillDisableDismissStateRef.current = null;
    }, [clearSkillDisableDismissTimer]);

    const updateSkillDisableCountdownLabel = React.useCallback((chip: HTMLElement, left: number) => {
      const countdown = chip.querySelector("[data-sd-countdown]") as HTMLElement | null;
      if (!countdown) return;
      countdown.hidden = false;
      countdown.textContent = promptComposerT("skillDisable.countdown", {
        seconds: left,
      });
    }, []);

    const fireChange = React.useCallback(() => {
      if (!editorRef.current) return;
      const text = serialize(editorRef.current);
      // After Backspace-clearing, browsers commonly leave residual `<br>` /
      // `<div><br></div>` nodes. `serialize` counts these as "\n", so a
      // visually empty editor would otherwise report length > 0 and hide the
      // placeholder. Treat as empty when no chip tokens exist and the text is
      // pure whitespace.
      const hasChip = !!editorRef.current.querySelector("[data-token]");
      setIsEmpty(!hasChip && text.replace(/[\s\u00A0]/g, "").length === 0);
      onTextChange?.(text);
    }, [onTextChange]);

    const rememberCaretOffset = React.useCallback(() => {
      if (!editorRef.current) return;
      const offset = getCaretTextOffset(editorRef.current);
      if (offset !== null) {
        savedCaretOffsetRef.current = offset;
      }
    }, []);

    const bindSkillDisableFilter = React.useCallback((chip: HTMLElement) => {
      const filter = findSkillDisableFilter(chip);
      if (!filter || filter.dataset.sdBound === "1") return;
      filter.dataset.sdBound = "1";

      const clearDeleteArm = () => {
        filter.dataset.sdDeleteArmed = "";
        filter.dataset.placeholder = promptComposerT("skillDisable.filterPlaceholder");
      };

      filter.addEventListener("input", () => {
        if (!isSkillDisableFilterEmpty(filter)) {
          clearDeleteArm();
        }
        onSkillDisableFilterChangeRef.current?.(filter.textContent ?? "");
      });
      filter.addEventListener("keydown", (event) => {
        // Keep newlines out of the in-chip filter; Enter is owned by the popover.
        if (event.key === "Enter") {
          event.preventDefault();
          return;
        }
        if (event.key !== "Backspace" && event.key !== "Delete") return;
        if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
        if (!isSkillDisableFilterEmpty(filter)) {
          clearDeleteArm();
          return;
        }

        // Empty filter: never let the caret escape in front of the chip.
        event.preventDefault();
        event.stopPropagation();
        focusSkillDisableFilterElement(filter);

        if (filter.dataset.sdDeleteArmed === "1") {
          clearSkillDisableDismiss();
          const editor = editorRef.current;
          if (editor) {
            placeCaretAtRemovedNode(editor, chip);
            fireChange();
            rememberCaretOffset();
          } else {
            chip.remove();
          }
          setChipTooltip(null);
          onSkillDisableFilterChangeRef.current?.("");
          onSkillDisableSessionClosedRef.current?.();
          return;
        }

        filter.dataset.sdDeleteArmed = "1";
        filter.dataset.placeholder = promptComposerT("skillDisable.deleteAgainHint");
      });
    }, [clearSkillDisableDismiss, fireChange, rememberCaretOffset]);

    const startSkillDisableDismissTicker = React.useCallback(() => {
      clearSkillDisableDismissTimer();
      skillDisableDismissTimerRef.current = window.setInterval(() => {
        const state = skillDisableDismissStateRef.current;
        if (!state || state.paused) return;
        state.left -= 1;
        if (state.left <= 0) {
          clearSkillDisableDismiss();
          state.chip.remove();
          fireChange();
          rememberCaretOffset();
          setChipTooltip(null);
          return;
        }
        updateSkillDisableCountdownLabel(state.chip, state.left);
      }, 1000);
    }, [
      clearSkillDisableDismiss,
      clearSkillDisableDismissTimer,
      fireChange,
      rememberCaretOffset,
      updateSkillDisableCountdownLabel,
    ]);

    const focusEditor = React.useCallback(() => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus({ preventScroll: true });
      if (savedCaretOffsetRef.current === null) return;
      window.requestAnimationFrame(() => {
        const current = editorRef.current;
        if (!current || document.activeElement !== current) return;
        const savedOffset = savedCaretOffsetRef.current;
        if (savedOffset === null) return;
        const boundedOffset = Math.max(0, Math.min(savedOffset, serialize(current).length));
        setCaretAtTextOffset(current, boundedOffset);
      });
    }, []);

    const setCaretAtOffsetAndRemember = React.useCallback((offset: number) => {
      const editor = editorRef.current;
      if (!editor) return;
      const place = () => {
        const current = editorRef.current;
        if (!current || document.activeElement !== current) return;
        const boundedOffset = Math.max(0, Math.min(offset, serialize(current).length));
        setCaretAtTextOffset(current, boundedOffset);
        savedCaretOffsetRef.current = boundedOffset;
      };
      place();
      window.requestAnimationFrame(place);
    }, []);

    React.useImperativeHandle(ref, () => ({
      getText: () => (editorRef.current ? serialize(editorRef.current) : ""),
      setText: (text: string) => {
        if (!editorRef.current) return;
        inflateInto(editorRef.current, text);
        fireChange();
      },
      clear: () => {
        if (!editorRef.current) return;
        clearSkillDisableDismiss();
        editorRef.current.innerHTML = "";
        savedCaretOffsetRef.current = 0;
        fireChange();
      },
      insertMention: (mention) => {
        if (!editorRef.current) return;
        editorRef.current.focus();
        const token = tokenForMention(mention);
        insertNodeAtCaret(editorRef.current, buildChipNode(token));
        insertNodeAtCaret(editorRef.current, document.createTextNode("\u00A0"));
        fireChange();
        rememberCaretOffset();
      },
      insertFileMention: (relativePath: string) => {
        if (!editorRef.current) return;
        editorRef.current.focus();
        const token = `@file:${relativePath}`;
        insertNodeAtCaret(editorRef.current, buildChipNode(token));
        insertNodeAtCaret(editorRef.current, document.createTextNode("\u00A0"));
        fireChange();
        rememberCaretOffset();
      },
      applyMentionAtRange: (atOffset, queryLength, mention) => {
        if (!editorRef.current) return;
        editorRef.current.focus();
        const token = tokenForMention(mention);
        const currentText = serialize(editorRef.current);
        const replaceFrom = Math.max(atOffset - 1, 0);
        const replaceTo = Math.min(atOffset + queryLength, currentText.length);
        const insertText = `${token}${CHIP_TRAILING_SPACER}`;
        const nextText =
          currentText.slice(0, replaceFrom) +
          insertText +
          currentText.slice(replaceTo);
        inflateInto(editorRef.current, nextText);
        fireChange();
        const nextCaretOffset = replaceFrom + insertText.length;
        setCaretAtOffsetAndRemember(nextCaretOffset);
      },
      applySlashAtRange: (slashOffset, queryLength, mention) => {
        if (!editorRef.current) return;
        editorRef.current.focus();
        const token = tokenForMention(mention);
        const currentText = serialize(editorRef.current);
        const replaceFrom = Math.max(slashOffset - 1, 0);
        const replaceTo = Math.min(slashOffset + queryLength, currentText.length);
        const insertText = `${token}${CHIP_TRAILING_SPACER}`;
        const nextText =
          currentText.slice(0, replaceFrom) +
          insertText +
          currentText.slice(replaceTo);
        inflateInto(editorRef.current, nextText);
        fireChange();
        const nextCaretOffset = replaceFrom + insertText.length;
        setCaretAtOffsetAndRemember(nextCaretOffset);
      },
      removeSlashAtRange: (slashOffset, queryLength) => {
        if (!editorRef.current) return;
        editorRef.current.focus();
        const currentText = serialize(editorRef.current);
        const replaceFrom = Math.max(slashOffset - 1, 0);
        const replaceTo = Math.min(slashOffset + queryLength, currentText.length);
        const nextText =
          currentText.slice(0, replaceFrom) +
          currentText.slice(replaceTo);
        inflateInto(editorRef.current, nextText);
        fireChange();
        setCaretAtOffsetAndRemember(replaceFrom);
      },
      insertTerminalSelectionContext: (contextId) => {
        if (!editorRef.current) return;
        editorRef.current.focus();
        const token = formatTerminalSelectionProtocol(contextId);
        insertNodeAtCaret(editorRef.current, buildChipNode(token));
        insertNodeAtCaret(editorRef.current, document.createTextNode("\u00A0"));
        fireChange();
        rememberCaretOffset();
      },
      insertSideChatCommand: (contextId) => {
        if (!editorRef.current) return;
        editorRef.current.focus();
        const token = formatSideChatProtocol(contextId);
        insertNodeAtCaret(editorRef.current, buildChipNode(token));
        insertNodeAtCaret(editorRef.current, document.createTextNode("\u00A0"));
        fireChange();
        rememberCaretOffset();
      },
      applySideCommandAtRange: (slashOffset, queryLength, contextId) => {
        if (!editorRef.current) return;
        editorRef.current.focus();
        const currentText = serialize(editorRef.current);
        const replaceFrom = Math.max(slashOffset - 1, 0);
        const replaceTo = Math.min(slashOffset + queryLength, currentText.length);
        const insertText = `${formatSideChatProtocol(contextId)}${CHIP_TRAILING_SPACER}`;
        const nextText =
          currentText.slice(0, replaceFrom) +
          insertText +
          currentText.slice(replaceTo);
        inflateInto(editorRef.current, nextText);
        fireChange();
        const nextCaretOffset = replaceFrom + insertText.length;
        setCaretAtOffsetAndRemember(nextCaretOffset);
      },
      insertSpawnCommand: (contextId) => {
        if (!editorRef.current) return;
        editorRef.current.focus();
        const token = formatSpawnProtocol(contextId);
        insertNodeAtCaret(editorRef.current, buildChipNode(token));
        insertNodeAtCaret(editorRef.current, document.createTextNode("\u00A0"));
        fireChange();
        rememberCaretOffset();
      },
      applySpawnCommandAtRange: (slashOffset, queryLength, contextId) => {
        if (!editorRef.current) return;
        editorRef.current.focus();
        const currentText = serialize(editorRef.current);
        const replaceFrom = Math.max(slashOffset - 1, 0);
        const replaceTo = Math.min(slashOffset + queryLength, currentText.length);
        const insertText = `${formatSpawnProtocol(contextId)}${CHIP_TRAILING_SPACER}`;
        const nextText =
          currentText.slice(0, replaceFrom) +
          insertText +
          currentText.slice(replaceTo);
        inflateInto(editorRef.current, nextText);
        fireChange();
        const nextCaretOffset = replaceFrom + insertText.length;
        setCaretAtOffsetAndRemember(nextCaretOffset);
      },
      applySkillDisableCommandAtRange: (slashOffset, queryLength) => {
        if (!editorRef.current) return;
        clearSkillDisableDismiss();
        editorRef.current.focus();
        const currentText = serialize(editorRef.current);
        const replaceFrom = Math.max(slashOffset - 1, 0);
        const replaceTo = Math.min(slashOffset + queryLength, currentText.length);
        // Trailing spacer after the chip so caret can exit into normal input later.
        const insertText = `${formatSkillDisableProtocol()}${CHIP_TRAILING_SPACER}`;
        const nextText =
          currentText.slice(0, replaceFrom) +
          insertText +
          currentText.slice(replaceTo);
        inflateInto(editorRef.current, nextText);
        const chip = findSkillDisableChip(editorRef.current);
        if (chip) bindSkillDisableFilter(chip);
        fireChange();
        const filter = findSkillDisableFilter(chip);
        if (filter) {
          focusSkillDisableFilterElement(filter);
          onSkillDisableFilterChangeRef.current?.("");
        } else {
          const nextCaretOffset = replaceFrom + insertText.length;
          setCaretAtOffsetAndRemember(nextCaretOffset);
        }
      },
      focusSkillDisableFilter: () => {
        const chip = findSkillDisableChip(editorRef.current);
        if (!chip) return;
        bindSkillDisableFilter(chip);
        const filter = findSkillDisableFilter(chip);
        if (filter && filter.getAttribute("contenteditable") === "true") {
          focusSkillDisableFilterElement(filter);
        }
      },
      setSkillDisableSessionActions: (actions) => {
        const chip = findSkillDisableChip(editorRef.current);
        if (!chip) return;
        renderSkillDisableSessionActions(chip, actions);
      },
      beginSkillDisableChipDismiss: (seconds) => {
        if (!editorRef.current) return;
        clearSkillDisableDismiss();
        const chip = findSkillDisableChip(editorRef.current);
        if (!chip) return;
        const filter = findSkillDisableFilter(chip);
        if (filter) {
          filter.setAttribute("contenteditable", "false");
          filter.textContent = "";
          filter.removeAttribute("data-placeholder");
          filter.hidden = true;
          onSkillDisableFilterChangeRef.current?.("");
        }
        placeCaretAfterNode(editorRef.current, chip);
        rememberCaretOffset();
        const left = Math.max(1, Math.floor(seconds));
        skillDisableDismissStateRef.current = { chip, left, paused: false };
        updateSkillDisableCountdownLabel(chip, left);
        startSkillDisableDismissTicker();
      },
      restoreSlashFromSkillDisable: () => {
        if (!editorRef.current) return;
        clearSkillDisableDismiss();
        editorRef.current.focus();
        const currentText = serialize(editorRef.current);
        const stripped = stripSkillDisableSession(currentText);
        const nextText = `${stripped}${stripped && !stripped.endsWith(" ") ? " " : ""}/`;
        inflateInto(editorRef.current, nextText);
        fireChange();
        setCaretAtOffsetAndRemember(nextText.length);
        onSkillDisableFilterChangeRef.current?.("");
      },
      clearSkillDisableSession: () => {
        if (!editorRef.current) return;
        clearSkillDisableDismiss();
        editorRef.current.focus();
        const currentText = serialize(editorRef.current);
        const nextText = stripSkillDisableSession(currentText);
        inflateInto(editorRef.current, nextText);
        fireChange();
        setCaretAtOffsetAndRemember(nextText.length);
        onSkillDisableFilterChangeRef.current?.("");
      },
      removeContextToken: (contextId) => {
        if (!editorRef.current) return;
        const tokens = [
          formatTerminalSelectionProtocol(contextId),
          formatSideChatProtocol(contextId),
          formatSpawnProtocol(contextId),
        ];
        for (const token of tokens) {
          const nodes = editorRef.current.querySelectorAll(`[data-token="${CSS.escape(token)}"]`);
          nodes.forEach((node) => node.remove());
        }
        fireChange();
      },
      insertImagePlaceholder: (n) => {
        if (!editorRef.current) return;
        editorRef.current.focus();
        const token = `[#img-${n}]`;
        insertNodeAtCaret(editorRef.current, buildChipNode(token));
        insertNodeAtCaret(editorRef.current, document.createTextNode("\u00A0"));
        fireChange();
        rememberCaretOffset();
      },
      removeImagePlaceholder: (n) => {
        if (!editorRef.current) return;
        const token = `[#img-${n}]`;
        const nodes = editorRef.current.querySelectorAll(`[data-token="${CSS.escape(token)}"]`);
        nodes.forEach((node) => node.remove());
        fireChange();
      },
      focus: focusEditor,
      placeCaretAtClientPoint: (clientX, clientY) => {
        if (!editorRef.current) return false;
        editorRef.current.focus();
        const placed = setCaretAtClientPoint(editorRef.current, clientX, clientY);
        if (placed) {
          rememberCaretOffset();
        }
        return placed;
      },
    }));

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      const selection = window.getSelection();
      if (isInsideSkillDisableFilter(selection?.anchorNode ?? null)) {
        // Filter key handling (Enter) is on the filter node; skip chip-deletion
        // and slash/at bookkeeping while editing inside the chip.
        return;
      }
      if (
        (event.key === "Backspace" || event.key === "Delete") &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        editorRef.current &&
        deleteChipNearCaret(editorRef.current, event.key === "Backspace" ? "backward" : "forward")
      ) {
        event.preventDefault();
        fireChange();
        rememberCaretOffset();
        setChipTooltip(null);
        onAtCancel?.();
        onSlashCancel?.();
        return;
      }
      if (event.key === "Enter" && !event.shiftKey && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onSubmit?.();
        return;
      }
      if (event.key === "@") {
        // After the browser inserts "@", measure the caret position by inserting
        // a temporary inline-block marker so it always has a layout box.
        requestAnimationFrame(() => {
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0 || !editorRef.current) return;
          const range = sel.getRangeAt(0);
          if (!editorRef.current.contains(range.startContainer)) return;
          if (isInsideSkillDisableFilter(range.startContainer)) return;
          const measuredRect = measureCaretRect(editorRef.current);
          const atCtx = readAtContextFromSelection(editorRef.current);
          if (atCtx) {
            onAtTrigger?.({ ...atCtx, caretRect: measuredRect });
          } else {
            onAtCancel?.();
          }
        });
        return;
      }
      if (event.key === "/") {
        // After the browser inserts "/", measure the caret position by inserting
        // a temporary inline-block marker so it always has a layout box.
        requestAnimationFrame(() => {
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0 || !editorRef.current) return;
          const range = sel.getRangeAt(0);
          if (!editorRef.current.contains(range.startContainer)) return;
          if (isInsideSkillDisableFilter(range.startContainer)) return;
          const measuredRect = measureCaretRect(editorRef.current);
          const slashCtx = readSlashContextFromSelection(editorRef.current);
          if (slashCtx) {
            onSlashTrigger?.({ ...slashCtx, caretRect: measuredRect });
          } else {
            onSlashCancel?.();
          }
        });
        return;
      }
      if (event.key === "Escape") {
        onAtCancel?.();
        onSlashCancel?.();
      }
    };

    const handleInput = () => {
      const selection = window.getSelection();
      if (isInsideSkillDisableFilter(selection?.anchorNode ?? null)) {
        // Filter updates are handled by the chip's own input listener.
        return;
      }
      fireChange();
      rememberCaretOffset();
      if (!editorRef.current) return;
      // The hovered chip may have been deleted by this input (e.g. Backspace);
      // a removed DOM node never fires mouseout, so the tooltip would stay
      // stuck. Drop it here — if the cursor is still on a surviving chip the
      // next mouseover will re-show it.
      setChipTooltip(null);
      const atCtx = readAtContextFromSelection(editorRef.current);
      if (atCtx) {
        onAtTrigger?.(atCtx);
      } else {
        onAtCancel?.();
      }
      const slashCtx = readSlashContextFromSelection(editorRef.current);
      if (slashCtx) {
        onSlashTrigger?.(slashCtx);
      } else {
        onSlashCancel?.();
      }
    };

    const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
      const items = event.clipboardData.items;
      let imageHandled = false;
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (blob) {
            event.preventDefault();
            imageHandled = true;
            const ext = item.type.split("/")[1] || "png";
            onImagePaste?.(blob, ext);
          }
        }
      }
      if (imageHandled) return;
      // Plain text paste — strip rich formatting
      const text = event.clipboardData.getData("text/plain");
      const appshotProtocol = parseAppshotProtocol(text);
      if (appshotProtocol && editorRef.current) {
        event.preventDefault();
        insertNodeAtCaret(
          editorRef.current,
          buildChipNode(`[#appshot:${appshotProtocol.timestamp}]`),
        );
        insertNodeAtCaret(editorRef.current, document.createTextNode("\u00A0"));
        fireChange();
        return;
      }
      const aiContext = parseAiContextProtocol(text);
      if (aiContext && editorRef.current) {
        event.preventDefault();
        const token = registerAiContextPrompt(aiContext.kind, aiContext.promptText);
        insertNodeAtCaret(editorRef.current, buildChipNode(token));
        insertNodeAtCaret(editorRef.current, document.createTextNode("\u00A0"));
        fireChange();
        return;
      }
      event.preventDefault();
      if (text) {
        document.execCommand("insertText", false, text);
      }
    };

    const handleEditorMouseOver = (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      const chip = target?.closest?.("[data-tooltip]") as HTMLElement | null;
      if (!chip || !editorRef.current?.contains(chip)) return;
      const text = chip.dataset.tooltip;
      if (!text) return;
      const rect = chip.getBoundingClientRect();
      setChipTooltip({
        text,
        top: rect.bottom + 6,
        left: rect.left + rect.width / 2,
      });
      const dismiss = skillDisableDismissStateRef.current;
      if (dismiss && dismiss.chip === chip) {
        dismiss.paused = true;
      }
    };

    const handleEditorMouseOut = (event: React.MouseEvent<HTMLDivElement>) => {
      const related = event.relatedTarget as Node | null;
      const target = event.target as HTMLElement | null;
      const chip = target?.closest?.("[data-tooltip]") as HTMLElement | null;
      if (!chip) return;
      // Still inside the same chip — keep the tooltip / pause.
      if (related && chip.contains(related)) return;
      setChipTooltip(null);
      const dismiss = skillDisableDismissStateRef.current;
      if (dismiss && dismiss.chip === chip) {
        dismiss.paused = false;
      }
    };

    React.useEffect(() => () => clearSkillDisableDismiss(), [clearSkillDisableDismiss]);

    return (
      <div className={cn("relative", className)}>
        {isEmpty && placeholder ? (
          <div
            className={cn(
              "pointer-events-none absolute inset-y-auto right-2 top-2 left-0 overflow-hidden text-base leading-6 text-muted-foreground/65",
              placeholderClassName,
            )}
          >
            {placeholder}
          </div>
        ) : null}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onKeyUp={rememberCaretOffset}
          onMouseUp={rememberCaretOffset}
          onBlur={rememberCaretOffset}
          onPaste={handlePaste}
          onMouseOver={handleEditorMouseOver}
          onMouseOut={handleEditorMouseOut}
          className={cn(
            "min-h-[88px] max-h-[148px] w-full overflow-y-auto whitespace-pre-wrap break-words rounded-t-xl rounded-b-none border border-transparent bg-transparent py-2 pl-0 pr-2 text-base leading-6 text-foreground outline-none transition-colors",
            editorClassName,
          )}
          spellCheck={false}
        />
        {chipTooltip && typeof document !== "undefined"
          ? createPortal(
              <div
                role="tooltip"
                className="pointer-events-none fixed z-[2147483646] -translate-x-1/2 whitespace-pre-line rounded-md bg-foreground px-3 py-1.5 text-xs text-background shadow-md animate-in fade-in-0 zoom-in-95"
                style={{ top: chipTooltip.top, left: chipTooltip.left }}
              >
                {chipTooltip.text}
              </div>,
              document.body,
            )
          : null}
      </div>
    );
  },
);

function insertNodeAtCaret(root: HTMLElement, node: Node) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) {
    root.appendChild(node);
    return;
  }
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) {
    root.appendChild(node);
    return;
  }
  range.deleteContents();
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}
