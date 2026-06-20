import { isPlausibleAccessToken } from "@/lib/access-token-format";

export function getAccessTokenSwitchReadiness({
  isSaving,
  token,
}: {
  isSaving: boolean;
  token: string;
}) {
  const trimmedToken = token.trim();

  if (isSaving) {
    return { canSwitch: false, reason: null };
  }

  if (!trimmedToken) {
    return { canSwitch: false, reason: "Paste an Access Token to switch this phone." };
  }

  if (!isPlausibleAccessToken(trimmedToken)) {
    return { canSwitch: false, reason: "Access Token must be at least 32 characters." };
  }

  return { canSwitch: true, reason: null };
}
