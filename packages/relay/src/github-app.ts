import type { Env } from "./index";

const GITHUB_API = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const GITHUB_PAGE_SIZE = 100;
const MAX_GITHUB_PAGES = 100;

export interface GithubInstallationRecord {
  installation_id: string;
  account_login: string | null;
  account_type: string | null;
  repository_selection: string;
  suspended_at: number | null;
}

export interface GithubRepositorySummary {
  id: string;
  full_name: string;
  private: boolean;
  default_branch: string;
}

interface GithubInstallationResponse {
  id: number | string;
  account?: {
    login?: string;
    type?: string;
  } | null;
  repository_selection?: string;
  suspended_at?: string | null;
}

interface GithubAccessTokenResponse {
  access_token?: string;
}

interface GithubInstallationTokenResponse {
  access_token?: string;
  token?: string;
}

interface GithubUserInstallationsResponse {
  installations?: Array<{ id?: number | string }>;
}

interface GithubUserResponse {
  login?: string;
}

interface GithubRepositoriesResponse {
  repositories?: Array<{
    id?: number | string;
    full_name?: string;
    private?: boolean;
    default_branch?: string;
  }>;
}

export function githubAppInstallUrl(env: Env, setupToken: string): string {
  const slug = env.GITHUB_APP_SLUG?.trim();
  if (!slug) {
    throw new Error("github_app_not_configured");
  }
  const url = new URL(`https://github.com/apps/${slug}/installations/new`);
  url.searchParams.set("state", setupToken);
  return url.toString();
}

export async function completeGithubInstallationSetup(
  env: Env,
  code: string,
  installationId: string,
): Promise<GithubInstallationRecord> {
  const userToken = await exchangeOAuthCode(env, code);
  const installation = await fetchInstallation(env, installationId);
  const userCanAuthorizeInstallation = await canUserAuthorizeInstallation(
    userToken,
    installation,
  );
  if (!userCanAuthorizeInstallation) {
    throw new Error("installation_not_authorized_for_user");
  }
  return installation;
}

export async function listInstallationRepositories(
  env: Env,
  installationId: string,
): Promise<GithubRepositorySummary[]> {
  const installationToken = await createInstallationToken(env, installationId);
  const repositories: GithubRepositorySummary[] = [];

  let path: string | null = `/installation/repositories?per_page=${GITHUB_PAGE_SIZE}&page=1`;
  for (let page = 1; path; page += 1) {
    if (page > MAX_GITHUB_PAGES) {
      throw new Error("github_repository_page_limit_exceeded");
    }
    const pageResult: { data: GithubRepositoriesResponse; nextPath: string | null } =
      await githubJsonPage<GithubRepositoriesResponse>(
        path,
        {
          errorCode: "github_repositories_request_failed",
          token: installationToken,
        },
      );
    const data = pageResult.data;
    const pageRepos = (data.repositories ?? [])
      .filter((repo) => repo.id && repo.full_name)
      .map((repo) => ({
        id: String(repo.id!),
        full_name: repo.full_name!,
        private: repo.private ?? false,
        default_branch: repo.default_branch ?? "main",
      }));
    repositories.push(...pageRepos);
    path = pageResult.nextPath;
  }

  return repositories;
}

async function exchangeOAuthCode(env: Env, code: string): Promise<string> {
  const clientId = env.GITHUB_APP_CLIENT_ID?.trim();
  const clientSecret = env.GITHUB_APP_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("github_oauth_not_configured");
  }

  let response: Response;
  try {
    response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "Atmos-Relay",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });
  } catch {
    throw new Error("github_oauth_exchange_failed_network");
  }

  if (!response.ok) {
    throw new GithubRequestError("github_oauth_exchange_failed", response.status);
  }

  let data: GithubAccessTokenResponse;
  try {
    data = await response.json() as GithubAccessTokenResponse;
  } catch {
    throw new Error("github_oauth_exchange_failed_invalid_json");
  }
  if (!data.access_token) {
    throw new Error("github_oauth_exchange_failed_missing_token");
  }
  return data.access_token;
}

async function userHasInstallation(
  userToken: string,
  installationId: string,
): Promise<boolean> {
  let path: string | null = `/user/installations?per_page=${GITHUB_PAGE_SIZE}&page=1`;
  for (let page = 1; path; page += 1) {
    if (page > MAX_GITHUB_PAGES) {
      throw new Error("github_installation_page_limit_exceeded");
    }
    const pageResult: { data: GithubUserInstallationsResponse; nextPath: string | null } =
      await githubJsonPage<GithubUserInstallationsResponse>(
        path,
        { errorCode: "github_user_installations_request_failed", token: userToken },
      );
    const data = pageResult.data;
    const installations = data.installations ?? [];
    if (installations.some((installation) => String(installation.id) === installationId)) {
      return true;
    }
    path = pageResult.nextPath;
  }
  return false;
}

async function canUserAuthorizeInstallation(
  userToken: string,
  installation: GithubInstallationRecord,
): Promise<boolean> {
  try {
    if (await userHasInstallation(userToken, installation.installation_id)) {
      return true;
    }
  } catch (error) {
    if (installation.account_type !== "User") {
      throw error;
    }
  }

  if (installation.account_type !== "User" || !installation.account_login) {
    return false;
  }

  const user = await fetchGithubUser(userToken);
  return normalizeGithubLogin(user.login) === normalizeGithubLogin(installation.account_login);
}

async function fetchGithubUser(userToken: string): Promise<GithubUserResponse> {
  return githubJson<GithubUserResponse>(
    "/user",
    { errorCode: "github_user_request_failed", token: userToken },
  );
}

async function fetchInstallation(
  env: Env,
  installationId: string,
): Promise<GithubInstallationRecord> {
  const jwt = await createAppJwt(env);
  const data = await githubJson<GithubInstallationResponse>(
    `/app/installations/${installationId}`,
    { errorCode: "github_installation_lookup_failed", token: jwt },
  );
  return {
    installation_id: String(data.id),
    account_login: data.account?.login ?? null,
    account_type: data.account?.type ?? null,
    repository_selection: data.repository_selection ?? "selected",
    suspended_at: parseGithubTimestamp(data.suspended_at),
  };
}

async function createInstallationToken(
  env: Env,
  installationId: string,
): Promise<string> {
  const jwt = await createAppJwt(env);
  const data = await githubJson<GithubInstallationTokenResponse>(
    `/app/installations/${installationId}/access_tokens`,
    { errorCode: "github_installation_token_request_failed", method: "POST", token: jwt },
  );
  const token = nonEmptyString(data.token) ?? nonEmptyString(data.access_token);
  if (!token) {
    console.warn("github_installation_token_missing", {
      installation_id: installationId,
      response_keys: safeJsonKeys(data),
    });
    throw new Error("github_installation_token_failed_missing_token");
  }
  return token;
}

async function createAppJwt(env: Env): Promise<string> {
  const appId = env.GITHUB_APP_ID?.trim();
  const privateKey = env.GITHUB_APP_PRIVATE_KEY?.trim();
  if (!appId || !privateKey) {
    throw new Error("github_app_not_configured");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({ alg: "RS256", typ: "JWT" });
  const payload = base64UrlJson({
    iat: now - 60,
    exp: now + 9 * 60,
    iss: appId,
  });
  const signingInput = `${header}.${payload}`;
  try {
    const key = await importPrivateKey(privateKey);
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(signingInput),
    );
    return `${signingInput}.${base64UrlBytes(new Uint8Array(signature))}`;
  } catch {
    throw new Error("github_app_jwt_failed");
  }
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const normalized = pem.replace(/\\n/g, "\n");
  const bytes = normalized.includes("BEGIN RSA PRIVATE KEY")
    ? wrapPkcs1RsaPrivateKey(pemBody(normalized, "RSA PRIVATE KEY"))
    : pemBody(normalized, "PRIVATE KEY");
  return crypto.subtle.importKey(
    "pkcs8",
    bytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function pemBody(pem: string, label: string): Uint8Array {
  const base64 = pem
    .replace(`-----BEGIN ${label}-----`, "")
    .replace(`-----END ${label}-----`, "")
    .replace(/\s+/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function wrapPkcs1RsaPrivateKey(pkcs1: Uint8Array): Uint8Array {
  const version = derIntegerZero();
  const algorithm = derSequence(
    derObjectIdentifier([1, 2, 840, 113549, 1, 1, 1]),
    derNull(),
  );
  const privateKey = derOctetString(pkcs1);
  return derSequence(version, algorithm, privateKey);
}

function derSequence(...parts: Uint8Array[]): Uint8Array {
  return derEncode(0x30, concatBytes(parts));
}

function derIntegerZero(): Uint8Array {
  return new Uint8Array([0x02, 0x01, 0x00]);
}

function derNull(): Uint8Array {
  return new Uint8Array([0x05, 0x00]);
}

function derOctetString(bytes: Uint8Array): Uint8Array {
  return derEncode(0x04, bytes);
}

function derObjectIdentifier(parts: number[]): Uint8Array {
  const [first, second, ...rest] = parts;
  if (first === undefined || second === undefined) {
    throw new Error("invalid_oid");
  }
  const encoded = [first * 40 + second];
  for (const part of rest) {
    const stack = [part & 0x7f];
    let value = part >> 7;
    while (value > 0) {
      stack.unshift((value & 0x7f) | 0x80);
      value >>= 7;
    }
    encoded.push(...stack);
  }
  return derEncode(0x06, new Uint8Array(encoded));
}

function derEncode(tag: number, value: Uint8Array): Uint8Array {
  return concatBytes([new Uint8Array([tag]), derLength(value.length), value]);
}

function derLength(length: number): Uint8Array {
  if (length < 0x80) {
    return new Uint8Array([length]);
  }
  const bytes: number[] = [];
  let value = length;
  while (value > 0) {
    bytes.unshift(value & 0xff);
    value >>= 8;
  }
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function githubJson<T>(
  path: string,
  options: { errorCode: string; method?: string; token: string },
): Promise<T> {
  const { data } = await githubJsonPage<T>(path, options);
  return data;
}

async function githubJsonPage<T>(
  path: string,
  options: { errorCode: string; method?: string; token: string },
): Promise<{ data: T; nextPath: string | null }> {
  let response: Response;
  try {
    response = await fetch(`${GITHUB_API}${path}`, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${options.token}`,
        "User-Agent": "Atmos-Relay",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
    });
  } catch {
    throw new Error(`${options.errorCode}_network`);
  }

  if (!response.ok) {
    throw new GithubRequestError(options.errorCode, response.status);
  }
  let data: T;
  try {
    data = await response.json() as T;
  } catch {
    throw new Error(`${options.errorCode}_invalid_json`);
  }
  return {
    data,
    nextPath: parseGithubNextPath(response.headers.get("Link")),
  };
}

class GithubRequestError extends Error {
  constructor(code: string, status: number) {
    super(`${code}_${status}`);
    this.name = "GithubRequestError";
  }
}

function normalizeGithubLogin(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function safeJsonKeys(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  return Object.keys(value as Record<string, unknown>)
    .filter((key) => /^[a-zA-Z0-9_.-]{1,64}$/.test(key))
    .slice(0, 20);
}

export function parseGithubNextPath(linkHeader: string | null): string | null {
  if (!linkHeader) {
    return null;
  }
  for (const part of linkHeader.split(",")) {
    const [rawUrl, ...params] = part.trim().split(";");
    if (!params.some((param) => param.trim() === 'rel="next"')) {
      continue;
    }
    const match = rawUrl.trim().match(/^<(.+)>$/);
    if (!match?.[1]) {
      return null;
    }
    try {
      const url = new URL(match[1]);
      if (url.origin !== GITHUB_API) {
        return null;
      }
      return `${url.pathname}${url.search}`;
    } catch {
      return null;
    }
  }
  return null;
}

function parseGithubTimestamp(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) {
    return null;
  }
  return Math.floor(millis / 1000);
}

function base64UrlJson(value: unknown): string {
  return base64UrlBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function base64UrlBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
