/**
 * Open Hub OAuth in a new tab / system browser via first-party `/v1/oauth/start`.
 * Shared by sign-in (AuthView) and account linking (Security settings).
 */
import { hubBaseUrl } from "@/api/hub-client";
import {
  hubCreateLinkTicket,
  hubGetSession,
  hubOAuthStartUrl,
  type HubOAuthMode,
  type HubSocialProvider,
} from "@/api/hub-auth-client";
import { openDesktopExternalUrl } from "@/shared/lib/desktop-external-url";
import { isDesktopRuntime } from "@/shared/lib/desktop-runtime";

export const HUB_OAUTH_STARTED_EVENT = "atmos:hub-oauth-started";

/** @deprecated use HUB_OAUTH_STARTED_EVENT */
export const HUB_DESKTOP_OAUTH_STARTED_EVENT = HUB_OAUTH_STARTED_EVENT;

const HUB_AUTH_BRIDGE_PATH = "/hub-auth/bridge";
const HUB_AUTH_DONE_PATH = "/hub-auth/done";

function isDesktopAuthSurface(): boolean {
  return (
    isDesktopRuntime() || process.env.NEXT_PUBLIC_BUILD_TARGET === "desktop"
  );
}

export function isHubSocialProvider(
  provider: string,
): provider is HubSocialProvider {
  return provider === "github" || provider === "google";
}

export type OpenHubOAuthResult =
  | { ok: true; url: string }
  | { ok: false; error: string; popupBlocked?: boolean };

/**
 * Build callback + start URL and open outside the current Atmos tab.
 * Returns without waiting for OAuth to finish.
 *
 * mode=link: if this surface has no Hub session cookie (desktop device auth),
 * mint a link_ticket via device Bearer so the system browser can still link.
 */
export async function openHubOAuth(opts: {
  provider: HubSocialProvider;
  mode: HubOAuthMode;
}): Promise<OpenHubOAuthResult> {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const hub = hubBaseUrl();
  if (!hub) {
    return { ok: false, error: "Hub is not configured" };
  }

  const desktop = isDesktopAuthSurface();

  // Sign-in on desktop: finish on Hub → mint device + bounce to local bridge.
  // Link (any surface) / web sign-in: done page so the OAuth tab can notify + close.
  // Do NOT send link through desktop-auth/complete (that would mint another device).
  // `provider` query is cosmetic for the callback chrome (logos); Hub appends `code` on top.
  const providerQuery = `provider=${encodeURIComponent(opts.provider)}`;
  const callbackURL =
    desktop && opts.mode === "sign-in"
      ? `${hub}/v1/desktop-auth/complete?return_to=${encodeURIComponent(`${origin}${HUB_AUTH_BRIDGE_PATH}?${providerQuery}`)}`
      : `${origin}${HUB_AUTH_DONE_PATH}?${providerQuery}`;

  let linkTicket: string | undefined;
  if (opts.mode === "link") {
    // Prefer existing browser Hub cookie when present (web).
    // Desktop Electron typically has no cookie — mint ticket with device Bearer.
    const cookieSession = await hubGetSession().catch(() => null);
    if (!cookieSession?.user) {
      try {
        const ticket = await hubCreateLinkTicket();
        linkTicket = ticket.ticket;
      } catch (e) {
        return {
          ok: false,
          error:
            e instanceof Error
              ? e.message
              : "Could not prepare account linking",
        };
      }
    }
  }

  const startUrl = hubOAuthStartUrl({
    provider: opts.provider,
    callbackURL,
    mode: opts.mode,
    linkTicket,
  });

  if (desktop) {
    const opened = await openDesktopExternalUrl(startUrl);
    if (!opened && typeof window !== "undefined") {
      const w = window.open(startUrl, "_blank");
      if (w) {
        try {
          w.opener = null;
        } catch {
          /* ignore */
        }
      }
    }
  } else if (typeof window !== "undefined") {
    // Never use "noopener" when checking return value — it forces null on success.
    const w = window.open(startUrl, "_blank");
    if (!w) {
      return {
        ok: false,
        error:
          "Could not open a new tab. Allow pop-ups for this site and try again.",
        popupBlocked: true,
      };
    }
    try {
      w.opener = null;
    } catch {
      /* ignore */
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(HUB_OAUTH_STARTED_EVENT));
  }

  return { ok: true, url: startUrl };
}
