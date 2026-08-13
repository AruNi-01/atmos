import { describe, expect, it } from "bun:test";

import {
  type ProbeResult,
  type SessionView,
  useSimulatorSessionStore,
} from "./use-simulator-session-store";

function session(workspaceId: string, phase: SessionView["phase"]): SessionView {
  return {
    phase,
    workspaceId,
    simulator: null,
    streamBaseUrl: null,
    transport: null,
    codec: null,
    size: null,
    lastError: null,
  };
}

const setupProbe: ProbeResult = {
  ok: false,
  code: "missing_iphone",
  facts: {
    runtimes: [],
    simulators: [],
  },
};

describe("useSimulatorSessionStore", () => {
  it("uses the phase from each status event", () => {
    const workspaceId = "workspace-status-phase";

    useSimulatorSessionStore.getState().applyStatus(workspaceId, session(workspaceId, "streaming"));
    expect(useSimulatorSessionStore.getState().getSlice(workspaceId).session.phase).toBe(
      "streaming",
    );

    useSimulatorSessionStore
      .getState()
      .applyStatus(workspaceId, session(workspaceId, "setup_required"));
    expect(useSimulatorSessionStore.getState().getSlice(workspaceId).session.phase).toBe(
      "setup_required",
    );
  });

  it("gives two readers the same workspace slice", () => {
    const workspaceId = "workspace-shared-slice";
    useSimulatorSessionStore.getState().applyStatus(workspaceId, session(workspaceId, "streaming"));

    const firstReader = useSimulatorSessionStore.getState().getSlice(workspaceId);
    const secondReader = useSimulatorSessionStore.getState().getSlice(workspaceId);
    expect(firstReader).toBe(secondReader);
    expect(firstReader.session.phase).toBe("streaming");
  });

  it("stores a probe without deriving a new phase", () => {
    const workspaceId = "workspace-probe-phase";
    useSimulatorSessionStore.getState().applyStatus(workspaceId, session(workspaceId, "streaming"));

    useSimulatorSessionStore.getState().applyProbe(workspaceId, setupProbe);

    const slice = useSimulatorSessionStore.getState().getSlice(workspaceId);
    expect(slice.probe).toEqual(setupProbe);
    expect(slice.session.phase).toBe("streaming");
  });

  it("starts only one attach while the workspace is idle", () => {
    const workspaceId = "workspace-attach-race";
    const store = useSimulatorSessionStore.getState();

    expect(store.beginAttachIfIdle(workspaceId)).toBe(true);
    expect(store.beginAttachIfIdle(workspaceId)).toBe(false);
  });

  it("allows Recheck to attach after setup_required", () => {
    const workspaceId = "workspace-attach-recheck";
    const store = useSimulatorSessionStore.getState();
    store.applyStatus(workspaceId, session(workspaceId, "setup_required"));

    expect(store.beginAttachIfIdle(workspaceId)).toBe(true);
    expect(store.beginAttachIfIdle(workspaceId)).toBe(false);
  });

  it("counts visible sidebar and center surfaces independently", () => {
    const workspaceId = "workspace-visible-surfaces";
    const store = useSimulatorSessionStore.getState();

    store.setSurfaceVisible(workspaceId, "sidebar", true);
    store.setSurfaceVisible(workspaceId, "center", true);
    expect(store.visibleSurfaceCount(workspaceId)).toBe(2);

    store.setSurfaceVisible(workspaceId, "sidebar", false);
    expect(store.visibleSurfaceCount(workspaceId)).toBe(1);
  });
});
