import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const bridgeSrc = readFileSync(
  join(import.meta.dir, "../server-state-event-bridge.tsx"),
  "utf8",
);

describe("resource monitor event bridge wiring", () => {
  test("applies resource_monitor_updated with setQueryData, not refetch", () => {
    expect(bridgeSrc).toContain('onEvent(event, handler)');
    expect(bridgeSrc).toContain('"resource_monitor_updated"');
    expect(bridgeSrc).toContain("applyResourceMonitorUpdated");
    expect(bridgeSrc).not.toMatch(
      /resource_monitor_updated[\s\S]{0,400}invalidateQueries/,
    );
  });
});
