const { withPodfile } = require("expo/config-plugins");

const DEFAULT_DEPLOYMENT_TARGET = "16.4";
const MARKER = "Atmos raises pod deployment targets";

function ensurePodDeploymentTarget(contents, deploymentTarget = DEFAULT_DEPLOYMENT_TARGET) {
  if (contents.includes(MARKER)) {
    return contents;
  }
  if (!/^\d+\.\d+$/.test(deploymentTarget)) {
    throw new Error(`Invalid iOS deployment target: ${deploymentTarget}`);
  }

  const anchor = "react_native_post_install(";
  const start = contents.indexOf(anchor);
  if (start < 0) {
    throw new Error(
      "Podfile is missing react_native_post_install, so pod deployment targets cannot be raised.",
    );
  }
  const close = contents.indexOf("\n    )\n", start);
  if (close < 0) {
    throw new Error("Podfile react_native_post_install call has an unexpected shape.");
  }

  const insertAt = close + "\n    )\n".length;
  const snippet = [
    `    # ${MARKER} to the app minimum. Xcode 27 rejects targets below 15.0.`,
    "    installer.pods_project.targets.each do |target|",
    "      target.build_configurations.each do |build_config|",
    "        current = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']",
    `        if current.nil? || current.to_f < ${deploymentTarget}.to_f`,
    `          build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${deploymentTarget}'`,
    "        end",
    "      end",
    "    end",
    "",
  ].join("\n");

  return contents.slice(0, insertAt) + snippet + contents.slice(insertAt);
}

function withIosPodDeploymentTarget(config) {
  const deploymentTarget = config.ios?.deploymentTarget ?? DEFAULT_DEPLOYMENT_TARGET;
  return withPodfile(config, (mod) => {
    mod.modResults.contents = ensurePodDeploymentTarget(mod.modResults.contents, deploymentTarget);
    return mod;
  });
}

module.exports = withIosPodDeploymentTarget;
module.exports.ensurePodDeploymentTarget = ensurePodDeploymentTarget;
