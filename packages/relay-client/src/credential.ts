import { RelayError } from "./errors";

/** Hub-minted device credentials are long random secrets (Relay rejects short junk). */
export const MIN_DEVICE_CREDENTIAL_LEN = 32;

export function isPlausibleDeviceCredential(token: string): boolean {
  return token.trim().length >= MIN_DEVICE_CREDENTIAL_LEN;
}

/** Trim and require a plausible Hub device credential before Relay REST calls. */
export function requireDeviceCredential(token: string): string {
  const trimmed = token.trim();
  if (!isPlausibleDeviceCredential(trimmed)) {
    throw new RelayError(
      "Hub device credential is missing or too short",
      401,
      "invalid_device_credential",
    );
  }
  return trimmed;
}
