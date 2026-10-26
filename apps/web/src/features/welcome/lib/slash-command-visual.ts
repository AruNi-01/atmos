/**
 * Shared slash-command appearance (glyph + tone) for the picker list and
 * composer chips. Command id / skill identity is the key — not token kind.
 */

import { VIEW_RUN_LOGS_SLASH_COMMAND_ID } from "@/features/browser/lib/run-log-context";
import {
  DEVICE_PREVIEW_SKILL_NAME,
  DEVICE_PREVIEW_SLASH_COMMAND_ID,
} from "@/features/simulator/lib/device-preview-agent-prompt";
import {
  BROWSER_USE_SKILL_NAME,
  BROWSER_USE_SLASH_COMMAND_ID,
} from "@/features/welcome/lib/slash-browser-use";
import {
  DESKTOP_USE_SKILL_NAME,
  DESKTOP_USE_SLASH_COMMAND_ID,
} from "@/features/welcome/lib/slash-desktop-use";
import type { AiContextKind } from "@/shared/lib/ai-context-protocol";

export const SIDE_SLASH_COMMAND_ID = "side";
export const SPAWN_SLASH_COMMAND_ID = "spawn";
export const DYNAMIC_SKILLS_SLASH_COMMAND_ID = "dynamic-skills";

export type SlashCommandGlyph =
  | "zap"
  | "browser-use"
  | "desktop-use"
  | "scroll-text"
  | "smartphone"
  | "eye-off"
  | "messages-square"
  | "message-circle-plus";

export type SlashCommandTone =
  | "default"
  | "amber"
  | "violet"
  | "emerald"
  | "cyan"
  | "red"
  | "green";

export type SlashCommandVisual = {
  glyph: SlashCommandGlyph;
  tone: SlashCommandTone;
};

export type SlashGlyphNode =
  | { type: "path"; d: string; opacity?: number }
  | { type: "rect"; width: number; height: number; x: number; y: number; rx?: number; ry?: number }
  | { type: "g"; transform: string; children: SlashGlyphNode[] };

export const DEFAULT_SLASH_COMMAND_VISUAL: SlashCommandVisual = {
  glyph: "zap",
  tone: "default",
};

const POINTER_NODES: SlashGlyphNode[] = [
  { type: "path", d: "M14 4.1 12 6", opacity: 0.9 },
  { type: "path", d: "m5.1 8-2.9-.8", opacity: 0.9 },
  { type: "path", d: "m6 12-1.9 2", opacity: 0.9 },
  { type: "path", d: "M7.2 2.2 8 5.1", opacity: 0.9 },
  {
    type: "path",
    d: "M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z",
  },
];

/** Lucide 1.x / BrowserUseIconStatic / DesktopUseIconStatic path sets. */
export const SLASH_COMMAND_GLYPH_NODES: Record<SlashCommandGlyph, SlashGlyphNode[]> = {
  zap: [
    {
      type: "path",
      d: "M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z",
    },
  ],
  "browser-use": [
    { type: "path", d: "M12 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9" },
    { type: "path", d: "M2 8h10" },
    { type: "path", d: "M6 4v4" },
    { type: "path", d: "M10 4v4" },
    { type: "g", transform: "translate(23.4 2.0) scale(-0.45 0.45)", children: POINTER_NODES },
  ],
  "desktop-use": [
    { type: "path", d: "M13 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3" },
    { type: "path", d: "M8 21h8" },
    { type: "path", d: "M12 17v4" },
    { type: "g", transform: "translate(22.6 0.2) scale(-0.48 0.48)", children: POINTER_NODES },
  ],
  "scroll-text": [
    { type: "path", d: "M15 12h-5" },
    { type: "path", d: "M15 8h-5" },
    { type: "path", d: "M19 17V5a2 2 0 0 0-2-2H4" },
    {
      type: "path",
      d: "M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3",
    },
  ],
  smartphone: [
    { type: "rect", width: 14, height: 20, x: 5, y: 2, rx: 2, ry: 2 },
    { type: "path", d: "M12 18h.01" },
  ],
  "eye-off": [
    {
      type: "path",
      d: "M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49",
    },
    { type: "path", d: "M14.084 14.158a3 3 0 0 1-4.242-4.242" },
    {
      type: "path",
      d: "M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143",
    },
    { type: "path", d: "m2 2 20 20" },
  ],
  "messages-square": [
    {
      type: "path",
      d: "M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z",
    },
    {
      type: "path",
      d: "M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1",
    },
  ],
  "message-circle-plus": [
    {
      type: "path",
      d: "M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719",
    },
    { type: "path", d: "M8 12h8" },
    { type: "path", d: "M12 8v8" },
  ],
};

const BY_COMMAND_ID: Record<string, SlashCommandVisual> = {
  [BROWSER_USE_SLASH_COMMAND_ID]: { glyph: "browser-use", tone: "amber" },
  [DESKTOP_USE_SLASH_COMMAND_ID]: { glyph: "desktop-use", tone: "violet" },
  [VIEW_RUN_LOGS_SLASH_COMMAND_ID]: { glyph: "scroll-text", tone: "emerald" },
  [DEVICE_PREVIEW_SLASH_COMMAND_ID]: { glyph: "smartphone", tone: "cyan" },
  [DYNAMIC_SKILLS_SLASH_COMMAND_ID]: { glyph: "eye-off", tone: "red" },
  [SPAWN_SLASH_COMMAND_ID]: { glyph: "messages-square", tone: "green" },
  [SIDE_SLASH_COMMAND_ID]: { glyph: "message-circle-plus", tone: "cyan" },
};

export function slashCommandVisual(commandId: string): SlashCommandVisual {
  return BY_COMMAND_ID[commandId] ?? DEFAULT_SLASH_COMMAND_VISUAL;
}

function skillHaystack(path: string, name?: string): string {
  return `${path} ${name ?? ""}`.toLowerCase();
}

/** Known Atmos skills that should keep the matching slash-command look. */
export function slashSkillVisual(path: string, name?: string): SlashCommandVisual | null {
  const hay = skillHaystack(path, name);
  if (hay.includes(BROWSER_USE_SKILL_NAME)) {
    return BY_COMMAND_ID[BROWSER_USE_SLASH_COMMAND_ID] ?? null;
  }
  if (hay.includes(DESKTOP_USE_SKILL_NAME)) {
    return BY_COMMAND_ID[DESKTOP_USE_SLASH_COMMAND_ID] ?? null;
  }
  if (hay.includes(DEVICE_PREVIEW_SKILL_NAME)) {
    return BY_COMMAND_ID[DEVICE_PREVIEW_SLASH_COMMAND_ID] ?? null;
  }
  return null;
}

/** AI-context chips that originate from Atmos slash commands. */
export function slashVisualForAiContextKind(kind: AiContextKind): SlashCommandVisual | null {
  if (kind === "run-log") return slashCommandVisual(VIEW_RUN_LOGS_SLASH_COMMAND_ID);
  if (kind === "device-preview") return slashCommandVisual(DEVICE_PREVIEW_SLASH_COMMAND_ID);
  return null;
}

export function slashCommandListToneClass(tone: SlashCommandTone): string {
  switch (tone) {
    case "amber":
      return "text-amber-600 dark:text-amber-400";
    case "violet":
      return "text-violet-600 dark:text-violet-400";
    case "emerald":
      return "text-emerald-600 dark:text-emerald-400";
    case "cyan":
      return "text-cyan-600 dark:text-cyan-400";
    case "red":
      return "text-red-600 dark:text-red-400";
    case "green":
      return "text-green-600 dark:text-green-400";
    case "default":
      return "";
  }
}

export function slashCommandChipToneClass(tone: SlashCommandTone): string {
  switch (tone) {
    case "amber":
      return "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "violet":
      return "border-violet-500/35 bg-violet-500/10 text-violet-700 dark:text-violet-300";
    case "emerald":
      return "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "cyan":
      return "border-cyan-500/35 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300";
    case "red":
      return "border-red-500/35 bg-red-500/10 text-red-700 dark:text-red-300";
    case "green":
      return "border-green-500/35 bg-green-500/10 text-green-700 dark:text-green-400";
    case "default":
      return "border-border/70 bg-muted/60 text-foreground";
  }
}
