/** Hub device credential / legacy access-token length gate. */
export function isPlausibleDeviceCredential(token: string) {
  return token.trim().length >= 32;
}

/** @deprecated use isPlausibleDeviceCredential */
export function isPlausibleAccessToken(token: string) {
  return isPlausibleDeviceCredential(token);
}
