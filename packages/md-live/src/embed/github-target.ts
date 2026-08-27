import type { MdLiveEmbedSpec } from "./types";

export type MdLiveGithubTarget = {
  kind: "issue" | "pr";
  owner: string;
  repo: string;
  number: number;
  url: string;
};

const GITHUB_URL_RE =
  /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)(?:[/?#]|$)/i;

export function parseGithubResourceUrl(url: string): MdLiveGithubTarget | null {
  const match = url.trim().match(GITHUB_URL_RE);
  if (!match) return null;
  const owner = match[1];
  const repo = match[2];
  const number = Number(match[4]);
  if (!owner || !repo || !Number.isFinite(number) || number <= 0) return null;
  const kind = match[3] === "pull" ? "pr" : "issue";
  return {
    kind,
    owner,
    repo,
    number,
    url: `https://github.com/${owner}/${repo}/${kind === "pr" ? "pull" : "issues"}/${number}`,
  };
}

function embedKindToGithub(kind: string): "issue" | "pr" | null {
  if (kind === "github-issue") return "issue";
  if (kind === "github-pr" || kind === "github-pull") return "pr";
  return null;
}

export function parseMdLiveGithubTarget(spec: MdLiveEmbedSpec): MdLiveGithubTarget | null {
  const fromUrl = spec.attrs.url ? parseGithubResourceUrl(spec.attrs.url) : null;
  const kind = embedKindToGithub(spec.kind) ?? fromUrl?.kind ?? null;
  const owner = spec.attrs.owner || fromUrl?.owner;
  const repo = spec.attrs.repo || fromUrl?.repo;
  const rawNumber = spec.attrs.n ?? spec.attrs.number ?? spec.attrs.issue ?? spec.attrs.pr;
  const parsedNumber = rawNumber ? Number(rawNumber) : NaN;
  const number =
    Number.isFinite(parsedNumber) && parsedNumber > 0 ? parsedNumber : fromUrl?.number;
  if (!kind || !owner || !repo || !number) return fromUrl;
  return {
    kind,
    owner,
    repo,
    number,
    url:
      spec.attrs.url && /^https?:\/\//.test(spec.attrs.url)
        ? spec.attrs.url
        : `https://github.com/${owner}/${repo}/${kind === "pr" ? "pull" : "issues"}/${number}`,
  };
}
