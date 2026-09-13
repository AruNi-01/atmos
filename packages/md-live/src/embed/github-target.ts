import type { MdLiveEmbedLayout, MdLiveEmbedSpec } from "./types";

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

export function githubKindToEmbedKind(kind: "issue" | "pr"): "github-issue" | "github-pr" {
  return kind === "pr" ? "github-pr" : "github-issue";
}

function githubTargetOf(
  kind: "issue" | "pr",
  owner: string,
  repo: string,
  number: number,
): MdLiveGithubTarget {
  return {
    kind,
    owner,
    repo,
    number,
    url: `https://github.com/${owner}/${repo}/${kind === "pr" ? "pull" : "issues"}/${number}`,
  };
}

const SHORTHAND_RE = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#(\d+)$/;
const HASH_RE = /^#(\d+)$/;

/** URL, `owner/repo#123`, or `#123` with a fallback owner/repo. */
export function parseGithubRefInput(
  text: string,
  expected?: "issue" | "pr" | null,
  fallback?: { owner: string; repo: string } | null,
): MdLiveGithubTarget | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const fromUrl = parseGithubResourceUrl(trimmed);
  if (fromUrl) {
    if (expected && fromUrl.kind !== expected) return null;
    return fromUrl;
  }
  if (!expected) return null;
  const short = trimmed.match(SHORTHAND_RE);
  if (short?.[1] && short[2] && short[3]) {
    return githubTargetOf(expected, short[1], short[2], Number(short[3]));
  }
  const hash = trimmed.match(HASH_RE);
  if (hash?.[1] && fallback?.owner && fallback.repo) {
    return githubTargetOf(expected, fallback.owner, fallback.repo, Number(hash[1]));
  }
  return null;
}

export function githubTargetToEmbedSpec(
  target: MdLiveGithubTarget,
  options?: { title?: string; layout?: MdLiveEmbedLayout },
): MdLiveEmbedSpec {
  const layout = options?.layout ?? "card";
  const title = (options?.title ?? "").trim() || `GitHub #${target.number}`;
  return {
    kind: githubKindToEmbedKind(target.kind),
    layout,
    title,
    attrs: {
      owner: target.owner,
      repo: target.repo,
      n: String(target.number),
      url: target.url,
    },
  };
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
