const { readFileSync } = require("node:fs");
const path = require("node:path");
const { describe, expect, test } = require("bun:test");

const app = JSON.parse(readFileSync(path.join(__dirname, "app.json"), "utf8"));

describe("iOS launch scene", () => {
  test("does not name a scene delegate Expo never generates", () => {
    const plist = app.expo.ios.infoPlist;
    // UIApplicationSceneManifest with Atmos.SceneDelegate opts into the scene
    // lifecycle. Expo's AppDelegate draws React Native into its own UIWindow,
    // and that class is not in the template, so the visible scene window stays
    // black. Photo-library strings stay; they are unrelated.
    expect(plist.UIApplicationSceneManifest).toBeUndefined();
    expect(JSON.stringify(plist)).not.toContain("SceneDelegate");
    expect(plist.NSPhotoLibraryUsageDescription).toContain("photos");
    expect(plist.NSPhotoLibraryAddUsageDescription).toContain("photos");
    expect(plist.NSCameraUsageDescription).toContain("camera");
  });
});
