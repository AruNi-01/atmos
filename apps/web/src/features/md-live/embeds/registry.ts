import type { MdLiveEmbedDefinition } from "./types";
import { mdLiveEmbedDefaultLayout } from "./defaults";
import { GenericMdLiveEmbed } from "./generic-embed";
import { GithubMdLiveEmbed } from "./github-embed";
import { PathMdLiveEmbed } from "./path-embed";

const GENERIC_EMBED: MdLiveEmbedDefinition = {
  kind: "unknown",
  defaultLayout: "card",
  View: GenericMdLiveEmbed,
};

export const MD_LIVE_EMBEDS: MdLiveEmbedDefinition[] = [
  {
    kind: "github-issue",
    defaultLayout: mdLiveEmbedDefaultLayout("github-issue"),
    slash: {
      id: "github",
      label: "slashGithub",
      keywords: "github issue pull request pr ticket",
      embed: "github",
    },
    View: GithubMdLiveEmbed,
  },
  {
    kind: "github-pr",
    defaultLayout: mdLiveEmbedDefaultLayout("github-pr"),
    View: GithubMdLiveEmbed,
  },
  {
    kind: "file",
    defaultLayout: mdLiveEmbedDefaultLayout("file"),
    slash: {
      id: "path",
      label: "slashEmbedPath",
      keywords: "project file folder directory path worktree",
      embed: "path",
    },
    View: PathMdLiveEmbed,
  },
  {
    kind: "folder",
    defaultLayout: mdLiveEmbedDefaultLayout("folder"),
    View: PathMdLiveEmbed,
  },
];

const BY_KIND = new Map(MD_LIVE_EMBEDS.map((entry) => [entry.kind, entry]));

export function resolveMdLiveEmbed(kind: string): MdLiveEmbedDefinition {
  return BY_KIND.get(kind) ?? GENERIC_EMBED;
}
