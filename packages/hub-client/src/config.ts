/**
 * Hub base URL configuration.
 * Apps should call `configureHubClient` at bootstrap; env fallbacks support Next/web.
 */

export type HubClientConfig = {
  /** e.g. https://hub.atmos.land or http://localhost:8787 */
  baseUrl: string;
};

/** True once `configureHubClient` has been called (even with empty baseUrl). */
let explicitlyConfigured = false;
let configuredBaseUrl = "";

function normalizeBase(url: string): string {
  return url.trim().replace(/\/$/, "");
}

/**
 * Set Hub origin for all hub-client HTTP calls. Call once at app start.
 * After this is called, env fallbacks are not used — the passed baseUrl wins
 * (including empty, which means "Hub disabled").
 */
export function configureHubClient(config: HubClientConfig): void {
  configuredBaseUrl = normalizeBase(config.baseUrl);
  explicitlyConfigured = true;
}

export function hubBaseUrl(): string {
  if (explicitlyConfigured) return configuredBaseUrl;

  // Convenience when apps have not bootstrapped yet (Next.js / Node).
  if (typeof process !== "undefined" && process.env) {
    const fromEnv =
      process.env.NEXT_PUBLIC_ATMOS_HUB_URL?.trim() ||
      process.env.ATMOS_HUB_URL?.trim() ||
      "";
    if (fromEnv) return normalizeBase(fromEnv);
  }
  return "";
}

export function hubConfigured(): boolean {
  return hubBaseUrl().length > 0;
}

export function requireHubBaseUrl(): string {
  const base = hubBaseUrl();
  if (!base) {
    throw new Error(
      "Atmos Hub is not configured. Call configureHubClient({ baseUrl }) or set NEXT_PUBLIC_ATMOS_HUB_URL / ATMOS_HUB_URL.",
    );
  }
  return base;
}

/** Test helper: forget explicit configure so env fallback applies again. */
export function resetHubClientConfigForTests(): void {
  explicitlyConfigured = false;
  configuredBaseUrl = "";
}
