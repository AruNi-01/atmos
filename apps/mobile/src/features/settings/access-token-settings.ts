import { isPlausibleDeviceCredential } from "@/lib/access-token-format";

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
    return { canSwitch: false, reason: "Paste a device credential to switch this phone." };
  }

  if (!isPlausibleDeviceCredential(trimmedToken)) {
    return { canSwitch: false, reason: "Device credential must be at least 32 characters." };
  }

  return { canSwitch: true, reason: null };
}
