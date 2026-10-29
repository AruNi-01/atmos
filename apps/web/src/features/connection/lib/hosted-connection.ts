"use client";

import { createTranslator } from "next-intl";
import {
  isPlausibleDeviceCredential,
  normalizeRelayUrl,
  RELAY_SECRET_HEADER,
  type ComputerRow,
  type RelayClientKind,
} from "@atmos/relay-client";
import { fetchRelayRuntimeInfo } from "@/api/relay";
import { getWebRelayClient } from "@/features/connection/lib/create-web-relay-client";
import { workbenchRelayClientKind } from "@/features/connection/lib/workbench-relay-client-kind";
import {
  getHostedLoopbackCandidates,
  httpBase,
  type ApiConfig,
} from "@/shared/lib/desktop-runtime";
import {
  fetchLocalComputerStatus,
  installLocalComputerIdentity,
  registerLocalComputer,
  type LocalComputerStatus,
} from "@/features/connection/lib/atmos-computer-local";
import {
  parseRelayJsonBody,
  responseNeverReachedRelay,
} from "@/features/connection/lib/relay-proxy-body";
import { currentAppLocale } from "@/shared/lib/current-app-locale";
import enMessages from "../../../../messages/en.json";
import zhMessages from "../../../../messages/zh.json";

const HOSTED_CONNECTION_PREF_KEY = "atmos:v1:hosted:last-target";
let cachedRuntimeLocale: "en" | "zh" | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedRuntimeTranslator: any = null;

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  message?: string;
  error?: string;
};

export type HostedConnectionPreference = "local" | "relay";

export interface HostedRemoteSession {
  ws_url: string;
  gateway_url: string;
  client_token: string;
  terminal_ws_url: string;
}

export function runtimeT(key: string, values?: Record<string, string | number>): string {
  const locale = currentAppLocale("en") === "zh" ? "zh" : "en";
  if (!cachedRuntimeTranslator || cachedRuntimeLocale !== locale) {
    cachedRuntimeLocale = locale;
    cachedRuntimeTranslator = createTranslator({
      locale,
      messages: locale === "zh" ? zhMessages : enMessages,
      namespace: "project.runtime",
    });
  }
  return cachedRuntimeTranslator(key as never, values as never);
}

function apiTokenHeaders(): Record<string, string> {
  const token = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_API_TOKEN : undefined;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function parseEnvelope<T>(raw: string): ApiEnvelope<T> | null {
  try {
    return JSON.parse(raw) as ApiEnvelope<T>;
  } catch {
    return null;
  }
}

function formatNetworkError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (message === "Load failed" || message.includes("Failed to fetch")) {
    return runtimeT("hostedConnection.errors.cannotReachLocalServer");
  }
  return message;
}

async function fetchLoopbackJson<T>(cfg: ApiConfig, path: string): Promise<T> {
  const res = await fetch(`${httpBase(cfg).replace(/\/$/, "")}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...apiTokenHeaders(),
    },
  });

  const raw = await res.text().catch(() => "");
  const envelope = parseEnvelope<T>(raw);
  if (!res.ok || !envelope?.success || !envelope.data) {
    throw new Error(
      envelope?.error ??
        envelope?.message ??
        (res.status === 405 || raw.trimStart().startsWith("<!")
          ? runtimeT("hostedConnection.errors.computerApiUnavailable")
          : `HTTP ${res.status}`),
    );
  }

  return envelope.data;
}

export function relayNeedsReregister(code: string | null | undefined): boolean {
  return code === "bad_server_credentials" || code === "computer_revoked";
}

/** Mint a register token and register this machine again so Relay stores a new secret. */
export async function reregisterLocalComputer(input: {
  accessToken: string;
  relayUrl: string;
  relaySecretKey?: string;
  displayName: string;
  registrationMeta?: Record<string, unknown>;
}): Promise<{
  server_id: string;
  display_name: string;
  relay_connected?: boolean;
  relay_last_error?: string | null;
  relay_error_code?: string | null;
}> {
  const tokenData = await getWebRelayClient({
    relayUrl: input.relayUrl,
    relaySecretKey: input.relaySecretKey,
  })
    .withDeviceCredential(input.accessToken)
    .createRegisterToken();
  try {
    return await registerLocalComputer(
      tokenData.register_token,
      input.displayName,
      input.relayUrl,
      input.relaySecretKey,
      input.registrationMeta,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!responseNeverReachedRelay(message)) {
      throw err;
    }
    // The local server's HTTP client received a challenge page. Register from
    // this page, then hand the identity back to the server to store.
    return registerComputerFromPage({
      registerToken: tokenData.register_token,
      relayUrl: input.relayUrl,
      relaySecretKey: input.relaySecretKey,
      displayName: input.displayName,
      registrationMeta: input.registrationMeta,
    });
  }
}

async function registerComputerFromPage(input: {
  registerToken: string;
  relayUrl: string;
  relaySecretKey?: string;
  displayName: string;
  registrationMeta?: Record<string, unknown>;
}): Promise<{
  server_id: string;
  display_name: string;
  relay_connected?: boolean;
  relay_last_error?: string | null;
  relay_error_code?: string | null;
}> {
  const status = await fetchLocalComputerStatus();
  const appDeviceId = status.app_device_id?.trim();
  if (!appDeviceId) {
    throw new Error(runtimeT("hostedConnection.errors.computerApiUnavailable"));
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const relaySecretKey = input.relaySecretKey?.trim();
  if (relaySecretKey) {
    headers[RELAY_SECRET_HEADER] = relaySecretKey;
  }

  const response = await fetch(`${normalizeRelayUrl(input.relayUrl)}/v1/computers/register`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      register_token: input.registerToken,
      display_name: input.displayName,
      ...(input.registrationMeta ? { registration_meta: input.registrationMeta } : {}),
      device: { app_device_id: appDeviceId },
    }),
  });
  const raw = await response.text();
  const parsed = parseRelayJsonBody(raw);
  if (!response.ok || !parsed || typeof parsed !== "object") {
    throw new Error(relayHttpFailureMessage(response.status, raw));
  }
  const body = parsed as {
    server_id?: unknown;
    server_secret?: unknown;
    relay_ws_url?: unknown;
    relay_url?: unknown;
    display_name?: unknown;
    registration_meta?: unknown;
  };
  if (
    typeof body.server_id !== "string" ||
    typeof body.server_secret !== "string" ||
    typeof body.relay_ws_url !== "string"
  ) {
    throw new Error(runtimeT("hostedConnection.errors.couldNotConnectComputer"));
  }

  const registrationMeta =
    body.registration_meta && typeof body.registration_meta === "object"
      ? (body.registration_meta as Record<string, unknown>)
      : input.registrationMeta;

  return installLocalComputerIdentity({
    serverId: body.server_id,
    serverSecret: body.server_secret,
    relayWsUrl: body.relay_ws_url,
    relayUrl: typeof body.relay_url === "string" ? body.relay_url : input.relayUrl,
    displayName: typeof body.display_name === "string" ? body.display_name : input.displayName,
    registrationMeta,
  });
}

function relayHttpFailureMessage(status: number, raw: string): string {
  const parsed = parseRelayJsonBody(raw);
  if (parsed && typeof parsed === "object") {
    const payload = parsed as { error?: unknown; message?: unknown };
    if (typeof payload.error === "string" && payload.error.trim()) return payload.error.trim();
    if (typeof payload.message === "string" && payload.message.trim()) {
      return payload.message.trim().slice(0, 180);
    }
  }
  if (responseNeverReachedRelay(raw)) {
    return runtimeT("hostedConnection.errors.relayBlockedThisRequest");
  }
  return `HTTP ${status}`;
}

export async function detectHostedLocalServer(): Promise<{
  config: ApiConfig;
  status: LocalComputerStatus;
}> {
  let lastError: unknown = null;
  for (const cfg of getHostedLoopbackCandidates(
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_API_TOKEN || undefined : undefined,
  )) {
    try {
      const status = await fetchLoopbackJson<LocalComputerStatus>(cfg, "/api/system/computer");
      return { config: cfg, status };
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(formatNetworkError(lastError));
}

export async function ensureHostedAccessTokenReady(
  _relayUrl: string,
  accessToken: string,
  _relaySecretKey?: string,
): Promise<void> {
  const token = accessToken.trim();
  if (!isPlausibleDeviceCredential(token)) {
    throw new Error(runtimeT("hostedConnection.errors.accessKeyTooShort"));
  }
  // Device credentials are Hub-minted and projected to Relay — no local tenant register.
}

export async function listHostedRemoteComputers(
  relayUrl: string,
  accessToken: string,
  relaySecretKey?: string,
): Promise<ComputerRow[]> {
  if (accessToken.trim().length >= 32) {
    await ensureHostedAccessTokenReady(relayUrl, accessToken, relaySecretKey);
  }
  return getWebRelayClient({ relayUrl, relaySecretKey })
    .withDeviceCredential(accessToken)
    .listComputers();
}

export async function createHostedRemoteSession(
  relayUrl: string,
  accessToken: string,
  serverId: string,
  relaySecretKey?: string,
  /**
   * Defaults to desktop when running in Electron, web otherwise.
   * Mobile does not use this path.
   */
  clientKind: Extract<RelayClientKind, "web" | "desktop"> = workbenchRelayClientKind(),
): Promise<HostedRemoteSession> {
  if (accessToken.trim().length >= 32) {
    await ensureHostedAccessTokenReady(relayUrl, accessToken, relaySecretKey);
  }
  let session: HostedRemoteSession;
  try {
    session = await getWebRelayClient({ relayUrl, relaySecretKey })
      .withDeviceCredential(accessToken)
      .createClientSession(serverId, { clientKind });
  } catch (err) {
    throw new Error(
      err instanceof Error
        ? err.message
        : runtimeT("hostedConnection.errors.couldNotConnectComputer"),
    );
  }
  // After Relay session: probe Computer via gateway HTTP (app concern, not relay-client).
  try {
    await fetchRelayRuntimeInfo(session.gateway_url, session.client_token);
  } catch (err) {
    throw new Error(
      err instanceof Error
        ? runtimeT("hostedConnection.errors.remoteRelayUnreachableWithReason", {
            message: err.message,
          })
        : runtimeT("hostedConnection.errors.remoteRelayUnreachable"),
    );
  }
  return session;
}

export function readHostedConnectionPreference(): HostedConnectionPreference | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(HOSTED_CONNECTION_PREF_KEY);
  return raw === "local" || raw === "relay" ? raw : null;
}

export function writeHostedConnectionPreference(target: HostedConnectionPreference): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(HOSTED_CONNECTION_PREF_KEY, target);
}
