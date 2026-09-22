const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativewind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

const withCss = withNativewind(config, {
  inlineVariables: false,
  globalClassNamePolyfill: true,
});

const expoUiWebStub = path.resolve(__dirname, "src/ui/primitives/expo-ui-web-stub.tsx");
const previousResolveRequest = withCss.resolver.resolveRequest;

withCss.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    platform === "web" &&
    (moduleName === "@expo/ui" || moduleName.startsWith("@expo/ui/"))
  ) {
    return { filePath: expoUiWebStub, type: "sourceFile" };
  }
  if (previousResolveRequest) {
    return previousResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withCss;
