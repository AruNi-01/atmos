import type { MdLiveEmbedLayout } from "@atmos/md-live";

export const MD_LIVE_EMBED_KINDS = ["github-issue", "github-pr", "file", "folder"] as const;

const DEFAULT_LAYOUT: Record<string, MdLiveEmbedLayout> = {
  "github-issue": "card",
  "github-pr": "card",
  file: "inline",
  folder: "inline",
};

export function mdLiveEmbedDefaultLayout(kind: string): MdLiveEmbedLayout {
  return DEFAULT_LAYOUT[kind] ?? "card";
}
