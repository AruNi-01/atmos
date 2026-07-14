import { describe, expect, it } from "bun:test";

import {
  areComputerQueryScopesEqual,
  wsRequestForComputerScope,
} from "@/api/ws/request";
import {
  getComputerQueryScope,
  type ComputerQueryScope,
} from "@/api/query/query-scope";

const scope: ComputerQueryScope = {
  activeInstanceId: "computer:alpha",
  connectionEpoch: 3,
  relaySessionRevision: 5,
};

describe("areComputerQueryScopesEqual", () => {
  it("requires the computer identity and both connection revisions to match", () => {
    expect(areComputerQueryScopesEqual(scope, { ...scope })).toBe(true);
    expect(
      areComputerQueryScopesEqual(
        { ...scope, activeInstanceId: "computer:beta" },
        scope,
      ),
    ).toBe(false);
    expect(
      areComputerQueryScopesEqual(
        { ...scope, connectionEpoch: scope.connectionEpoch + 1 },
        scope,
      ),
    ).toBe(false);
    expect(
      areComputerQueryScopesEqual(
        {
          ...scope,
          relaySessionRevision: scope.relaySessionRevision + 1,
        },
        scope,
      ),
    ).toBe(false);
  });

  it("rejects a stale scope before attempting a request", async () => {
    const currentScope = getComputerQueryScope();
    const staleScope = {
      ...currentScope,
      connectionEpoch: currentScope.connectionEpoch + 1,
    };

    await expect(
      wsRequestForComputerScope(staleScope, "settings_bootstrap_get"),
    ).rejects.toThrow("Computer scope changed before WebSocket request");
  });
});
