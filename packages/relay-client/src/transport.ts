import { relayErrorFromBody } from "./errors";

export type RelayHttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type RelayTransportRequest = {
  /** Normalized Relay origin (no trailing slash). */
  baseUrl: string;
  /** Path starting with `/`. */
  path: string;
  method: RelayHttpMethod;
  headers: Record<string, string>;
  body?: string;
};

export type RelayTransportResponse = {
  status: number;
  /** Parsed JSON body, or empty object when body is empty/non-JSON. */
  json: unknown;
};

/**
 * Low-level HTTP for Relay REST.
 * Apps may inject loopback proxy (desktop) or instrumented fetch.
 */
export type RelayTransport = (
  req: RelayTransportRequest,
) => Promise<RelayTransportResponse>;

/** Default: global `fetch` against `baseUrl + path`. */
export function createFetchTransport(
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): RelayTransport {
  return async (req) => {
    const response = await fetchImpl(`${req.baseUrl}${req.path}`, {
      method: req.method,
      headers: req.headers,
      body: req.body,
    });

    const json = (await response.json().catch(() => ({}))) as unknown;
    return { status: response.status, json };
  };
}

export async function relayRequestJson<T>(
  transport: RelayTransport,
  req: RelayTransportRequest,
  opts?: { okStatuses?: number[] },
): Promise<T> {
  const result = await transport(req);
  const okStatuses = opts?.okStatuses ?? [200];
  if (!okStatuses.includes(result.status)) {
    throw relayErrorFromBody(
      result.status,
      result.json,
      `Relay request failed with ${result.status}`,
    );
  }
  return result.json as T;
}
