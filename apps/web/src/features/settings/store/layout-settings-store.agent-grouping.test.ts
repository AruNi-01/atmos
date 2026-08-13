import { describe, expect, it } from "bun:test";

import { useLayoutSettingsStore } from "@/features/settings/store/layout-settings-store";

describe("layout settings agent two-column", () => {
  it("defaults By Agent two-column layout off", () => {
    expect(useLayoutSettingsStore.getState().workspaceSidebarAgentTwoColumn).toBe(false);
  });
});
