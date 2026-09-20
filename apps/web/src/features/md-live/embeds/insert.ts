import {
  formatEmbedDirective,
  githubTargetToEmbedSpec,
  parseGithubRefInput,
  type MdLiveEmbedSpec,
  type MdLiveGithubTarget,
} from "@atmos/md-live";
import { posixBasename } from "../lib/md-live-media-path";
import { mdLiveEmbedDefaultLayout } from "./defaults";

export function markdownFromEmbedSpec(spec: MdLiveEmbedSpec): string {
  const directive = formatEmbedDirective(spec);
  return spec.layout === "card" ? `${directive}\n` : directive;
}

export function embedSpecFromGithubTarget(
  target: MdLiveGithubTarget,
  title?: string,
): MdLiveEmbedSpec {
  const kind = target.kind === "pr" ? "github-pr" : "github-issue";
  const layout = mdLiveEmbedDefaultLayout(kind);
  return githubTargetToEmbedSpec(target, { title, layout });
}

export function embedSpecFromGithubInput(
  text: string,
  fallback?: { owner: string; repo: string } | null,
  title?: string,
): MdLiveEmbedSpec | null {
  const target = parseGithubRefInput(text, null, fallback);
  if (!target) return null;
  return embedSpecFromGithubTarget(target, title);
}

export function embedSpecFromPath(
  relativePath: string,
  kind: "file" | "folder",
): MdLiveEmbedSpec {
  const path = relativePath.replace(/^\.\//, "");
  const layout = mdLiveEmbedDefaultLayout(kind);
  return {
    kind,
    layout,
    title: posixBasename(path),
    attrs: { path },
  };
}
