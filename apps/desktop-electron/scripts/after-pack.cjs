/**
 * electron-builder afterPack:
 * 1. Strip unused Chromium locales + SwiftShader (all platforms).
 * 2. Inject macOS 26 Liquid Glass Assets.car when actool ≥ 26 is available.
 *
 * @param {import('electron-builder').AfterPackContext} context
 */
const {
  slimPackagedElectronApp,
} = require("./slim-electron-runtime.cjs");
const afterPackMacosIcon = require("./after-pack-macos-icon.cjs");

function formatBytes(n) {
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)}M`;
  if (n >= 1024) return `${Math.round(n / 1024)}K`;
  return `${n}B`;
}

module.exports = async function afterPack(context) {
  const platform = context.electronPlatformName;
  const result = slimPackagedElectronApp(context.appOutDir, platform);
  const localeBytes = formatBytes(result.locales.removedBytes);
  const swiftBytes = formatBytes(result.swiftshader.removedBytes);
  console.log(
    `[after-pack] locales kept=${result.locales.kept.join(",") || "(none)"} ` +
      `removed=${result.locales.removed.length} (${localeBytes})`,
  );
  console.log(
    `[after-pack] swiftshader removed=${result.swiftshader.removed.length} (${swiftBytes})`,
  );

  await afterPackMacosIcon(context);
};
