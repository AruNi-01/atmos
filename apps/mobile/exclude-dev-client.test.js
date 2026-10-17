const { describe, expect, test } = require("bun:test");
const {
  DEV_CLIENT_EXCLUDES,
  withDevClientExcluded,
} = require("../../scripts/agent-chat-parity/exclude-dev-client");

describe("withDevClientExcluded", () => {
  test("adds the dev-client pods to package.json autolinking exclude", () => {
    const next = withDevClientExcluded({
      name: "@atmos/mobile",
      dependencies: { expo: "~56.0.12" },
    });
    expect(next.dependencies).toEqual({ expo: "~56.0.12" });
    expect(next.expo.autolinking.exclude).toEqual(DEV_CLIENT_EXCLUDES);
  });

  test("keeps an exclude list that is already present", () => {
    const next = withDevClientExcluded({
      expo: { autolinking: { exclude: ["expo-keep-awake", "expo-dev-client"] } },
    });
    expect(next.expo.autolinking.exclude).toEqual(["expo-keep-awake", ...DEV_CLIENT_EXCLUDES]);
  });
});
