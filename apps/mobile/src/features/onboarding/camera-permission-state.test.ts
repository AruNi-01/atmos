// @ts-expect-error bun:test is available at runtime but not in the mobile tsconfig types
import { describe, expect, test } from "bun:test";
import { cameraScannerModel, shouldArmCameraPreviewTimer } from "./camera-permission-state";

const granted = { canAskAgain: true, granted: true, status: "granted" };

describe("shouldArmCameraPreviewTimer", () => {
  const base = { granted: true, mountError: null, ready: false, timedOut: false };

  test("arms again after a timeout is cleared for a second attempt", () => {
    expect(shouldArmCameraPreviewTimer(base)).toBe(true);
    expect(shouldArmCameraPreviewTimer({ ...base, timedOut: true })).toBe(false);
    expect(shouldArmCameraPreviewTimer({ ...base, timedOut: false })).toBe(true);
  });

  test("does not arm once the preview is ready or the permission is missing", () => {
    expect(shouldArmCameraPreviewTimer({ ...base, ready: true })).toBe(false);
    expect(shouldArmCameraPreviewTimer({ ...base, granted: false })).toBe(false);
    expect(shouldArmCameraPreviewTimer({ ...base, mountError: "failed" })).toBe(false);
  });
});

describe("cameraScannerModel", () => {
  test("asks once while access is still undetermined", () => {
    expect(
      cameraScannerModel({
        mountError: null,
        permission: { canAskAgain: true, granted: false, status: "undetermined" },
        ready: false,
        timedOut: false,
      }),
    ).toEqual({ autoRequest: true, kind: "prompt" });
  });

  test("treats a missing status as not yet asked", () => {
    expect(
      cameraScannerModel({
        mountError: null,
        permission: { canAskAgain: true, granted: false },
        ready: false,
        timedOut: false,
      }),
    ).toEqual({ autoRequest: true, kind: "prompt" });
  });

  test("shows the allow button again when the system can still ask", () => {
    expect(
      cameraScannerModel({
        mountError: null,
        permission: { canAskAgain: true, granted: false, status: "denied" },
        ready: false,
        timedOut: false,
      }),
    ).toEqual({ autoRequest: false, kind: "prompt" });
  });

  test("sends a permanent denial to Settings", () => {
    expect(
      cameraScannerModel({
        mountError: null,
        permission: { canAskAgain: false, granted: false, status: "denied" },
        ready: false,
        timedOut: false,
      }).kind,
    ).toBe("settings");
  });

  test("covers loading, starting, timeout, and mount errors", () => {
    expect(
      cameraScannerModel({
        mountError: null,
        permission: null,
        ready: false,
        timedOut: false,
      }).kind,
    ).toBe("loading");
    expect(
      cameraScannerModel({
        mountError: null,
        permission: granted,
        ready: false,
        timedOut: false,
      }).kind,
    ).toBe("starting");
    expect(
      cameraScannerModel({
        mountError: null,
        permission: granted,
        ready: true,
        timedOut: false,
      }).kind,
    ).toBe("preview");
    const timedOut = cameraScannerModel({
      mountError: null,
      permission: granted,
      ready: false,
      timedOut: true,
    });
    expect(timedOut.kind).toBe("error");
    if (timedOut.kind === "error") {
      expect(timedOut.message).toContain("did not start");
    }
    expect(
      cameraScannerModel({
        mountError: "Camera permissions not granted - component could not be rendered.",
        permission: granted,
        ready: false,
        timedOut: false,
      }),
    ).toEqual({
      kind: "error",
      message: "Camera permissions not granted - component could not be rendered.",
    });
  });
});
