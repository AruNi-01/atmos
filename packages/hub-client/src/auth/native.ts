/**
 * Native (Expo / React Native) Hub auth entry — implement when mobile ships login.
 *
 * Expected responsibilities (not implemented yet):
 * - Open system browser / ASWebAuthenticationSession for GitHub|Google via Hub
 * - Handle deep-link callback
 * - Persist session / call Hub REST with credentials
 * - Enroll device into SecureStore via DeviceCredentialStore
 */

export function getHubAuthClient(): never {
  throw new Error(
    "@atmos/hub-client/auth/native is not implemented yet. Use auth/browser on web, or implement native OAuth + Hub session.",
  );
}

export async function hubGetSession(): Promise<null> {
  return null;
}

export async function hubSignInSocial(
  _provider: "github" | "google",
  _callbackURL?: string,
): Promise<never> {
  throw new Error("@atmos/hub-client/auth/native: hubSignInSocial not implemented");
}

export async function hubSignOut(): Promise<void> {
  /* no-op until native auth exists */
}
