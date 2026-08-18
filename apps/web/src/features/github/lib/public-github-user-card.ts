import type {
  GithubContributionDayPayload,
  GithubUserCardPayload,
} from "@atmos/api-types/ws/dto/github";
import { queryKeys } from "@/api/query/query-keys";

export type GithubUserCardSource = "auto" | "public" | "ws";

/** Same window as Great UI Github Card and the local `github_user_card` WS path. */
export const PUBLIC_USER_CARD_CONTRIBUTION_DAYS = 119;

/** Jonathan Gruber's public contributions host — the one Great UI Github Card uses. */
export const PUBLIC_GITHUB_CONTRIBUTIONS_API =
  "https://github-contributions-api.jogruber.de/v4";

export function normalizeGithubLogin(login?: string | null): string | null {
  if (!login) return null;
  const trimmed = login.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\[bot\]$/i, "").replace(/^@/, "") || null;
}

/** Local `gh` GraphQL when a computer WS is up; otherwise the public contributions API. */
export function resolveGithubUserCardSources(
  source: GithubUserCardSource,
  wsAvailable: boolean,
  wsFailed: boolean,
): { useWs: boolean; usePublic: boolean } {
  const useWs = source !== "public" && wsAvailable;
  const usePublic =
    source !== "ws" && (source === "public" || !wsAvailable || wsFailed);
  return { useWs, usePublic };
}

function parseContributionDays(raw: unknown): GithubContributionDayPayload[] {
  if (!Array.isArray(raw)) return [];
  const today = new Date().toISOString().slice(0, 10);
  const days: GithubContributionDayPayload[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const day = item as {
      date?: unknown;
      count?: unknown;
      level?: unknown;
    };
    if (typeof day.date !== "string" || !day.date || day.date > today) continue;
    const count =
      typeof day.count === "number" && Number.isFinite(day.count)
        ? Math.max(0, Math.floor(day.count))
        : 0;
    const level =
      typeof day.level === "number" && Number.isFinite(day.level)
        ? Math.max(0, Math.min(4, Math.floor(day.level)))
        : 0;
    days.push({ date: day.date, count, level });
  }

  days.sort((a, b) => a.date.localeCompare(b.date));
  return days.length > PUBLIC_USER_CARD_CONTRIBUTION_DAYS
    ? days.slice(-PUBLIC_USER_CARD_CONTRIBUTION_DAYS)
    : days;
}

function parseLastYearTotal(
  raw: unknown,
  contributions: GithubContributionDayPayload[],
): number {
  if (raw && typeof raw === "object") {
    const total = raw as Record<string, unknown>;
    if (typeof total.lastYear === "number" && Number.isFinite(total.lastYear)) {
      return Math.max(0, Math.floor(total.lastYear));
    }
    const year = String(new Date().getFullYear());
    if (typeof total[year] === "number" && Number.isFinite(total[year])) {
      return Math.max(0, Math.floor(total[year] as number));
    }
  }
  return contributions.reduce((sum, day) => sum + day.count, 0);
}

export function parsePublicGithubUserCard(
  body: unknown,
  fallbackLogin: string,
): GithubUserCardPayload {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid GitHub user payload");
  }
  const data = body as {
    total?: unknown;
    contributions?: unknown;
  };
  const contributions = parseContributionDays(data.contributions);
  return {
    login: fallbackLogin,
    name: null,
    avatar_url: `https://github.com/${fallbackLogin}.png`,
    total_contributions: parseLastYearTotal(data.total, contributions),
    contributions,
  };
}

/**
 * Public share/leaderboard fallback. Uses the Great UI Github Card host
 * (`github-contributions-api.jogruber.de`) so the browser never hits
 * `api.github.com` — unauthenticated GitHub REST 403s under rate limits.
 */
export async function fetchPublicGithubUserCard(
  login: string,
): Promise<GithubUserCardPayload> {
  const normalized = normalizeGithubLogin(login);
  if (!normalized || /[/\s]/.test(normalized)) {
    throw new Error("GitHub username is required");
  }

  const res = await fetch(
    `${PUBLIC_GITHUB_CONTRIBUTIONS_API}/${encodeURIComponent(normalized)}?y=last`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(`GitHub user '${normalized}' not found`);
  }
  return parsePublicGithubUserCard(await res.json(), normalized);
}

export function publicGithubUserCardQueryOptions(
  params: { login: string },
  options?: { enabled?: boolean },
) {
  const login = normalizeGithubLogin(params.login) ?? "";
  return {
    queryKey: queryKeys.publicGithub.userCard(login),
    queryFn: () => fetchPublicGithubUserCard(login),
    staleTime: 60 * 60_000,
    gcTime: 2 * 60 * 60_000,
    enabled: (options?.enabled ?? true) && Boolean(login),
    retry: 1,
  };
}
