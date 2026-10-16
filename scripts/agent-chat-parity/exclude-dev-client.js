/**
 * CocoaPods autolinking reads `expo.autolinking.exclude` from the app
 * package.json. `app.config.js` exclude is not consulted. The parity
 * workflow runs this before `expo prebuild` so the dev-client launcher
 * pods stay out of that build. Do not commit the rewritten package.json.
 */
const fs = require("node:fs");
const path = require("node:path");

const DEV_CLIENT_EXCLUDES = [
  "expo-dev-client",
  "expo-dev-launcher",
  "expo-dev-menu",
  "expo-dev-menu-interface",
];

function withDevClientExcluded(pkg) {
  const next = structuredClone(pkg);
  const expo = { ...(next.expo ?? {}) };
  const autolinking = { ...(expo.autolinking ?? {}) };
  const exclude = new Set([...(autolinking.exclude ?? []), ...DEV_CLIENT_EXCLUDES]);
  autolinking.exclude = [...exclude];
  expo.autolinking = autolinking;
  next.expo = expo;
  return next;
}

function writeDevClientExclude(pkgPath) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const next = withDevClientExcluded(pkg);
  fs.writeFileSync(pkgPath, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

module.exports = {
  DEV_CLIENT_EXCLUDES,
  withDevClientExcluded,
  writeDevClientExclude,
};

if (require.main === module) {
  const pkgPath = process.argv[2] ?? path.join(__dirname, "../../apps/mobile/package.json");
  writeDevClientExclude(pkgPath);
}
