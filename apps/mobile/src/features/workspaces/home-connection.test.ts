// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { workspaceHomePhase } from "./home-connection";

const readyBase = {
  bootstrapPending: false,
  computerCount: 1,
  computersFetched: true,
  computersPending: false,
  createError: false,
  createPending: false,
  deviceCredentialLoaded: true,
  hasActiveSession: true,
  hasCachedComputer: true,
  hasDeviceCredential: true,
  sessionHydrated: true,
} as const;

describe("workspaceHomePhase", () => {
  test("stays on the logo while the computer socket is still opening", () => {
    expect(workspaceHomePhase({ ...readyBase, wsState: "connecting" })).toBe("loading");
    expect(workspaceHomePhase({ ...readyBase, wsState: "reconnecting" })).toBe("loading");
  });

  test("leaves the logo when the socket has failed", () => {
    expect(workspaceHomePhase({ ...readyBase, wsState: "closed" })).toBe("connection-failed");
    expect(workspaceHomePhase({ ...readyBase, wsState: "error" })).toBe("connection-failed");
  });

  test("shows the workspace list only after the socket is open", () => {
    expect(
      workspaceHomePhase({ ...readyBase, bootstrapPending: true, wsState: "open" }),
    ).toBe("loading");
    expect(workspaceHomePhase({ ...readyBase, wsState: "open" })).toBe("ready");
  });

  test("asks for a computer when several are online and none is selected", () => {
    expect(
      workspaceHomePhase({
        ...readyBase,
        computerCount: 2,
        hasActiveSession: false,
        hasCachedComputer: false,
        wsState: "closed",
      }),
    ).toBe("choose-computer");
  });
});
