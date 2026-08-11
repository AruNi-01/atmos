/**
 * Mobile Hub sign-in: system browser OAuth → deep link → device Bearer only.
 */
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import {
  hubExchangeMobileAuthCode,
  hubMobileOAuthStartUrl,
  MOBILE_OAUTH_RETURN_TO,
  type HubSocialProvider,
  type MobileAuthExchangePayload,
} from "@atmos/hub-client/auth/native";
import type { HubMe } from "@atmos/hub-client";
import { acceptDeviceCredential } from "@/lib/device-credential";
import { ensureMobileHubConfigured } from "@/lib/hub-config";

WebBrowser.maybeCompleteAuthSession();

export type { HubSocialProvider, MobileAuthExchangePayload };

function resolveReturnTo(): string {
  try {
    const url = Linking.createURL("hub-auth/callback");
    if (url.startsWith("atmos:")) return url;
  } catch {
    /* ignore */
  }
  return MOBILE_OAUTH_RETURN_TO;
}

export async function signInWithHubProvider(
  provider: HubSocialProvider,
): Promise<{ payload: MobileAuthExchangePayload; me: HubMe }> {
  await ensureMobileHubConfigured();
  const returnTo = resolveReturnTo();
  const startUrl = hubMobileOAuthStartUrl({
    provider,
    returnTo,
    label: "Mobile",
  });

  const result = await WebBrowser.openAuthSessionAsync(startUrl, returnTo);
  if (result.type !== "success" || !("url" in result) || !result.url) {
    throw new Error(
      result.type === "cancel" || result.type === "dismiss"
        ? "Sign-in cancelled"
        : "Sign-in did not complete",
    );
  }

  const returned = new URL(result.url);
  const code = returned.searchParams.get("code")?.trim() ?? "";
  if (!code) {
    const err = returned.searchParams.get("error")?.trim() || "missing_code";
    throw new Error(`Sign-in failed: ${err}`);
  }

  const payload = await hubExchangeMobileAuthCode(code);
  const me = await acceptDeviceCredential({
    device_id: payload.device_id,
    device_credential: payload.device_credential,
  });
  return { payload, me };
}
