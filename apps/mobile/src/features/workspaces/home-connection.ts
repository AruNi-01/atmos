export type HomeSocketState =
  | "idle"
  | "connecting"
  | "open"
  | "reconnecting"
  | "closed"
  | "error";

export type WorkspaceHomePhase = "loading" | "choose-computer" | "connection-failed" | "ready";

/**
 * A closed or errored Computer socket is a finished attempt. Leaving it in the
 * loading phase kept the workspace logo up after every failed relay upgrade.
 */
export function workspaceHomePhase(input: {
  bootstrapPending: boolean;
  computerCount: number;
  computersFetched: boolean;
  computersPending: boolean;
  createError: boolean;
  createPending: boolean;
  deviceCredentialLoaded: boolean;
  hasActiveSession: boolean;
  hasCachedComputer: boolean;
  hasDeviceCredential: boolean;
  sessionHydrated: boolean;
  wsState: HomeSocketState;
}): WorkspaceHomePhase {
  const socketSettled = input.wsState === "closed" || input.wsState === "error";
  const isHomeConnected = input.hasDeviceCredential && input.wsState === "open";
  const isConnecting =
    input.hasDeviceCredential &&
    !input.createError &&
    (input.createPending ||
      ((input.hasCachedComputer || input.hasActiveSession) &&
        !socketSettled &&
        input.wsState !== "open"));
  const isLoading =
    !input.deviceCredentialLoaded ||
    !input.sessionHydrated ||
    (input.hasDeviceCredential && input.computersPending) ||
    isConnecting ||
    (isHomeConnected && input.bootstrapPending);
  if (isLoading) return "loading";

  if (
    input.hasDeviceCredential &&
    input.sessionHydrated &&
    input.computersFetched &&
    input.wsState !== "open" &&
    !input.hasActiveSession &&
    input.computerCount > 1
  ) {
    return "choose-computer";
  }

  if (
    input.hasDeviceCredential &&
    input.sessionHydrated &&
    input.computersFetched &&
    input.wsState !== "open" &&
    (input.computerCount === 1 || input.hasActiveSession)
  ) {
    return "connection-failed";
  }

  return "ready";
}
