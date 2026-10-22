/** How long a granted camera may stay unready before we replace the black preview. */
export const CAMERA_PREVIEW_TIMEOUT_MS = 2500;

export type CameraPermissionSnapshot = {
  canAskAgain: boolean;
  granted: boolean;
  /** Expo `PermissionStatus` values, kept as strings so the enum assigns. */
  status?: string;
} | null;

export type CameraScannerModel =
  | { autoRequest: boolean; kind: "prompt" }
  | { kind: "error"; message: string }
  | { kind: "loading" }
  | { kind: "preview" }
  | { kind: "settings" }
  | { kind: "starting" };

const PREVIEW_TIMEOUT_MESSAGE =
  "The camera preview did not start. Check that this device has a camera.";

/**
 * Ask the OS once per scanner open while access is still undetermined.
 * A denial that cannot be asked again, a grant, and a second call in the same
 * open do not request. That keeps the system dialog from looping.
 */
export function shouldRequestSystemCameraPermission(input: {
  permission: CameraPermissionSnapshot;
  requestedThisOpen: boolean;
}): boolean {
  if (input.requestedThisOpen) return false;
  const permission = input.permission;
  if (!permission || permission.granted || !permission.canAskAgain) return false;
  return (permission.status ?? "undetermined") === "undetermined";
}

/** A new timer starts only for a fresh attempt. Retry clears `timedOut` so the next attempt can arm again. */
export function shouldArmCameraPreviewTimer(input: {
  granted: boolean;
  mountError: string | null;
  ready: boolean;
  timedOut: boolean;
}) {
  return input.granted && !input.ready && input.mountError == null && !input.timedOut;
}

export function cameraScannerModel(input: {
  mountError: string | null;
  permission: CameraPermissionSnapshot;
  ready: boolean;
  timedOut: boolean;
}): CameraScannerModel {
  if (input.mountError) {
    return { kind: "error", message: input.mountError };
  }
  if (!input.permission) return { kind: "loading" };
  if (!input.permission.granted) {
    if (!input.permission.canAskAgain) return { kind: "settings" };
    return {
      autoRequest: shouldRequestSystemCameraPermission({
        permission: input.permission,
        requestedThisOpen: false,
      }),
      kind: "prompt",
    };
  }
  if (input.timedOut) return { kind: "error", message: PREVIEW_TIMEOUT_MESSAGE };
  if (!input.ready) return { kind: "starting" };
  return { kind: "preview" };
}
