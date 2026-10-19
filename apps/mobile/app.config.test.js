const { describe, expect, test } = require("bun:test");
const applyParityPreviewConfig = require("./app.config");

const base = {
  name: "Atmos",
  plugins: [
    "expo-router",
    ["expo-dev-client", { skipOnboarding: true }],
    "./plugins/with-ios-clear-tab-bar.js",
  ],
  autolinking: { exclude: ["already-excluded"] },
};

function pluginNames(config) {
  return (config.plugins ?? []).map((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin));
}

describe("applyParityPreviewConfig", () => {
  test("keeps expo-dev-client for a normal build", () => {
    const previous = process.env.EXPO_PUBLIC_PARITY_PREVIEW;
    delete process.env.EXPO_PUBLIC_PARITY_PREVIEW;
    try {
      const next = applyParityPreviewConfig({ config: structuredClone(base) });
      expect(pluginNames(next)).toContain("expo-dev-client");
      expect(next.autolinking).toEqual(base.autolinking);
    } finally {
      if (previous === undefined) delete process.env.EXPO_PUBLIC_PARITY_PREVIEW;
      else process.env.EXPO_PUBLIC_PARITY_PREVIEW = previous;
    }
  });

  test("drops the dev-client launcher when the parity preview flag is set", () => {
    const previous = process.env.EXPO_PUBLIC_PARITY_PREVIEW;
    process.env.EXPO_PUBLIC_PARITY_PREVIEW = "1";
    try {
      const next = applyParityPreviewConfig({ config: structuredClone(base) });
      expect(pluginNames(next)).not.toContain("expo-dev-client");
      expect(pluginNames(next)).toContain("expo-router");
      expect(pluginNames(next)).toContain("./plugins/with-ios-clear-tab-bar.js");
      expect(next.autolinking.exclude).toEqual(
        expect.arrayContaining([
          "already-excluded",
          "expo-dev-client",
          "expo-dev-launcher",
          "expo-dev-menu",
          "expo-dev-menu-interface",
        ]),
      );
    } finally {
      if (previous === undefined) delete process.env.EXPO_PUBLIC_PARITY_PREVIEW;
      else process.env.EXPO_PUBLIC_PARITY_PREVIEW = previous;
    }
  });

  test("keeps a scene manifest for parity preview builds", () => {
    const withScene = {
      ...base,
      ios: {
        infoPlist: {
          UIApplicationSceneManifest: { UISceneDelegateClassName: "Atmos.SceneDelegate" },
          NSCameraUsageDescription: "camera",
        },
      },
    };
    const previous = process.env.EXPO_PUBLIC_PARITY_PREVIEW;
    process.env.EXPO_PUBLIC_PARITY_PREVIEW = "1";
    try {
      const next = applyParityPreviewConfig({ config: structuredClone(withScene) });
      expect(next.ios.infoPlist.UIApplicationSceneManifest).toEqual(
        withScene.ios.infoPlist.UIApplicationSceneManifest,
      );
      expect(next.ios.infoPlist.NSCameraUsageDescription).toBe("camera");
      expect(pluginNames(next)).not.toContain("expo-dev-client");
    } finally {
      if (previous === undefined) delete process.env.EXPO_PUBLIC_PARITY_PREVIEW;
      else process.env.EXPO_PUBLIC_PARITY_PREVIEW = previous;
    }
  });
});
