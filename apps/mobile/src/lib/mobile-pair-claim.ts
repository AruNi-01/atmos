import {
  configureHubClient,
  hubClaimMobilePair,
  parseMobilePairScan,
  type HubMe,
} from "@atmos/hub-client";
import { acceptDeviceCredential } from "@/lib/device-credential";
import { ensureMobileHubConfigured, getDefaultHubUrl } from "@/lib/hub-config";

export async function claimPairFromScan(raw: string): Promise<{
  device_id: string;
  user_id: string;
  me: HubMe;
}> {
  await ensureMobileHubConfigured();
  const parsed = parseMobilePairScan(raw);
  if (!parsed) {
    throw new Error("Unrecognized QR code. Scan the pair code from Desktop/Web.");
  }

  const hub = parsed.hub?.trim() || getDefaultHubUrl();
  if (parsed.hub) {
    configureHubClient({ baseUrl: hub });
  }

  try {
    return await withResilientFetch(async () => {
      const claimed = await hubClaimMobilePair(parsed.code, { hubBase: hub });
      const me = await acceptDeviceCredential({
        device_id: claimed.device_id,
        device_credential: claimed.device_credential,
      });
      return {
        device_id: claimed.device_id,
        user_id: claimed.user_id,
        me,
      };
    });
  } catch (error) {
    throw toPairError(error, hub);
  }
}

/**
 * iOS drops expo/fetch while AVCaptureSession is running, and a lost POST
 * cannot be replayed by URLSession. Retry once, then fall back to XHR.
 * Scoped to this call so the rest of the app keeps the default fetch.
 */
async function withResilientFetch<T>(fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch.bind(globalThis);
  globalThis.fetch = resilientFetch(original);
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

function resilientFetch(original: typeof fetch): typeof fetch {
  return async (input, init) => {
    try {
      return await original(input, init);
    } catch (error) {
      if (!isConnectionLost(error)) throw error;
      await delay(300);
      try {
        return await original(input, init);
      } catch (retryError) {
        if (!isConnectionLost(retryError)) throw retryError;
        return xhrFetch(input, init);
      }
    }
  };
}

function isConnectionLost(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /network connection was lost|network request failed|timed out/i.test(message);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function xhrFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  const method = (
    init?.method ??
    (typeof input === "string" || input instanceof URL ? "GET" : input.method) ??
    "GET"
  ).toUpperCase();
  const headers = new Headers(
    init?.headers ??
      (typeof input === "string" || input instanceof URL ? undefined : input.headers),
  );
  const body = init?.body ?? null;
  if (body != null && typeof body !== "string") {
    return Promise.reject(new TypeError("Network request failed"));
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.timeout = 20000;
    headers.forEach((value, key) => {
      xhr.setRequestHeader(key, value);
    });
    xhr.onload = () => {
      resolve(new Response(xhr.responseText, { status: xhr.status, statusText: xhr.statusText }));
    };
    xhr.onerror = () => reject(new TypeError("Network request failed"));
    xhr.ontimeout = () => reject(new TypeError("Network request failed"));
    xhr.send(body);
  });
}

function toPairError(error: unknown, hub: string): Error {
  if (!(error instanceof Error) || !isConnectionLost(error)) {
    return error instanceof Error ? error : new Error("Could not claim pair code.");
  }
  let host = hub;
  try {
    host = new URL(hub).host;
  } catch {
    /* keep the raw hub string */
  }
  return new Error(`Could not reach ${host}. Check the network and scan the QR again.`);
}
