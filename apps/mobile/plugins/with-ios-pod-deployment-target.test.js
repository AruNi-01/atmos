const { describe, expect, test } = require("bun:test");
const { ensurePodDeploymentTarget } = require("./with-ios-pod-deployment-target");

const PODFILE = `  post_install do |installer|
    react_native_post_install(
      installer,
      config[:reactNativePath],
      :mac_catalyst_enabled => false,
      :ccache_enabled => ccache_enabled?(podfile_properties),
    )
  end
`;

describe("ensurePodDeploymentTarget", () => {
  test("raises every pod target to the app minimum inside post_install", () => {
    const next = ensurePodDeploymentTarget(PODFILE, "16.4");
    expect(next).toContain("current.to_f < 16.4.to_f");
    expect(next).toContain("IPHONEOS_DEPLOYMENT_TARGET'] = '16.4'");
    expect(next.indexOf("react_native_post_install(")).toBeLessThan(
      next.indexOf("pods_project.targets.each"),
    );
    expect(next.indexOf("pods_project.targets.each")).toBeLessThan(next.lastIndexOf("  end"));
  });

  test("leaves an already patched Podfile unchanged", () => {
    const once = ensurePodDeploymentTarget(PODFILE, "16.4");
    expect(ensurePodDeploymentTarget(once, "16.4")).toBe(once);
  });

  test("refuses a Podfile Expo did not generate", () => {
    expect(() => ensurePodDeploymentTarget("platform :ios, '16.4'\n", "16.4")).toThrow(
      /react_native_post_install/,
    );
  });
});
