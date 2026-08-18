import type { GithubUserCardPayload } from "@atmos/api-types/ws/dto/github";
import { queryKeys } from "@/api/query/query-keys";

export type GithubUserCardSource = "auto" | "public" | "ws";

export function normalizeGithubLogin(login?: string | null): string | null {
  if (!login) return null;
  const trimmed = login.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\[bot\]$/i, "").replace(/^@/, "") || null;
}

/** Local `gh` GraphQL when a computer WS is up; otherwise GitHub's public REST. */
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

export function parsePublicGithubUserCard(
  body: unknown,
  fallbackLogin: string,
): GithubUserCardPayload {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid GitHub user payload");
  }
  const user = body as {
    login?: unknown;
    name?: unknown;
    avatar_url?: unknown;
  };
  const login =
    typeof user.login === "string" && user.login.trim()
      ? user.login.trim()
      : fallbackLogin;
  const name =
    typeof user.name === "string" && user.name.trim() ? user.name.trim() : null;
  const avatar_url =
    typeof user.avatar_url === "string" && user.avatar_url.trim()
      ? user.avatar_url.trim()
      : null;
  return {
    login,
    name,
    avatar_url,
    // Public REST has no contribution calendar — empty means "not loaded".
    total_contributions: 0,
    contributions: [],
  };
}

/**
 * Unauthenticated `GET /users/{login}`. Calendar is not in the public REST
 * surface, so the card falls back to profile only.
 */
export async function fetchPublicGithubUserCard(
  login: string,
): Promise<GithubUserCardPayload> {
  const normalized = normalizeGithubLogin(login);
  if (!normalized || /[/\s]/.test(normalized)) {
    throw new Error("GitHub username is required");
  }

  // Simple GET only — custom headers trigger a CORS preflight that GitHub
  // may not allow from the browser.
  const res = await fetch(
    `https://api.github.com/users/${encodeURIComponent(normalized)}`,
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
