import { MD_LIVE_HEADING_LEVELS } from "./types";
import type { MdLiveSlashPick } from "./types";

export type MdLiveSlashGroupId = "heading" | "basic" | "advanced" | "media" | "others";

export type MdLiveSlashItem = {
  id: string;
  label: string;
  keywords: string;
  group: MdLiveSlashGroupId;
  pick?: MdLiveSlashPick;
  open?: "emoji" | "image" | "video" | "audio" | "file";
};

export const MD_LIVE_SLASH_GROUPS: { id: MdLiveSlashGroupId; label: string }[] = [
  { id: "heading", label: "slashGroupHeading" },
  { id: "basic", label: "slashGroupBasic" },
  { id: "advanced", label: "slashGroupAdvanced" },
  { id: "media", label: "slashGroupMedia" },
  { id: "others", label: "slashGroupOthers" },
];

export const MD_LIVE_SLASH_ITEMS: MdLiveSlashItem[] = [
  ...MD_LIVE_HEADING_LEVELS.map((level) => ({
    id: `h${level}`,
    label: `slashHeading${level}`,
    keywords: `heading ${level} h${level} title`,
    group: "heading" as const,
    pick: { kind: "block" as const, action: { type: "heading" as const, level } },
  })),
  { id: "quote", label: "slashQuote", keywords: "quote blockquote", group: "basic", pick: { kind: "block", action: { type: "quote" } } },
  { id: "ul", label: "slashBulletList", keywords: "bullet list unordered", group: "basic", pick: { kind: "block", action: { type: "bullet-list" } } },
  { id: "ol", label: "slashOrderedList", keywords: "ordered numbered list", group: "basic", pick: { kind: "block", action: { type: "ordered-list" } } },
  { id: "todo", label: "slashTaskList", keywords: "todo task check checklist", group: "basic", pick: { kind: "block", action: { type: "task-list" } } },
  { id: "toggle", label: "slashToggle", keywords: "toggle fold details summary collapse accordion", group: "basic", pick: { kind: "block", action: { type: "toggle" } } },
  { id: "code", label: "slashCode", keywords: "code fence block", group: "basic", pick: { kind: "block", action: { type: "code" } } },
  { id: "inline-code", label: "slashInlineCode", keywords: "inline code backtick", group: "basic", pick: { kind: "block", action: { type: "inline-code" } } },
  { id: "hr", label: "slashDivider", keywords: "divider hr rule", group: "basic", pick: { kind: "block", action: { type: "divider" } } },
  { id: "table", label: "slashTable", keywords: "table grid", group: "advanced", pick: { kind: "block", action: { type: "table" } } },
  { id: "image", label: "slashImage", keywords: "image picture photo media upload", group: "media", open: "image" },
  { id: "video", label: "slashVideo", keywords: "video movie media upload mp4", group: "media", open: "video" },
  { id: "audio", label: "slashAudio", keywords: "audio music sound media upload mp3", group: "media", open: "audio" },
  { id: "file", label: "slashFile", keywords: "file attach media upload pdf", group: "media", open: "file" },
  { id: "emoji", label: "slashEmoji", keywords: "emoji smiley face", group: "others", open: "emoji" },
];
