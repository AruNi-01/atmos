// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import { useConnectionStore } from "@/features/connection/store/connection-store";
import { useUiPrefStore } from "@/shared/stores/use-ui-pref-store";
import {
  readCenterStageLastTab,
  setCenterStageLastTab,
} from "@/shared/stores/use-ui-pref-hooks";

describe("center stage last tab store updates", () => {
  it("notifies ui-pref subscribers so chrome can follow tab clicks", () => {
    const instanceId = useConnectionStore.getState().activeInstanceId;
    let seen: string | undefined;
    const unsub = useUiPrefStore.subscribe((state) => {
      const slice = state.byInstance[instanceId]?.centerStage as
        | { lastTabByContext?: Record<string, string> }
        | undefined;
      seen = slice?.lastTabByContext?.["ws-tab-click"];
    });
    setCenterStageLastTab("ws-tab-click", "changes");
    unsub();
    expect(readCenterStageLastTab("ws-tab-click")).toBe("changes");
    expect(seen).toBe("changes");
  });
});
