/**
 * Parity preview builds (EXPO_PUBLIC_PARITY_PREVIEW=1) ship the embedded
 * bundle and must not install the expo-dev-client launcher. Local dev
 * keeps the plugin. CocoaPods reads exclude from package.json, which
 * scripts/agent-chat-parity/exclude-dev-client.js writes before prebuild.
 * The scene manifest stays. with-ios-scene-lifecycle.js creates the window
 * in SceneDelegate; deleting the manifest leaves no window at all.
 *
 * @param {{ config: import("expo/config").ExpoConfig }} ctx
 * @returns {import("expo/config").ExpoConfig}
 */
function applyParityPreviewConfig({ config }) {
  if (process.env.EXPO_PUBLIC_PARITY_PREVIEW !== "1") {
    return config;
  }

  const plugins = (config.plugins ?? []).filter((plugin) => {
    const name = Array.isArray(plugin) ? plugin[0] : plugin;
    return name !== "expo-dev-client";
  });
  const exclude = new Set([
    ...(config.autolinking?.exclude ?? []),
    "expo-dev-client",
    "expo-dev-launcher",
    "expo-dev-menu",
    "expo-dev-menu-interface",
  ]);

  return {
    ...config,
    plugins,
    autolinking: {
      ...config.autolinking,
      exclude: [...exclude],
    },
  };
}

module.exports = applyParityPreviewConfig;
