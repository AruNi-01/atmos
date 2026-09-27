const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativewind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

const withCss = withNativewind(config, {
  inlineVariables: false,
  globalClassNamePolyfill: true,
});

const cssResolve = withCss.resolver.resolveRequest;
const expoUiWebStub = path.resolve(__dirname, "src/ui/primitives/expo-ui-web-stub.tsx");
const remendOnJs = path.resolve(__dirname, "src/features/agent-chat/remend-on-js.ts");

withCss.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.includes("worklets/remendWorklet")) {
    return { filePath: remendOnJs, type: "sourceFile" };
  }
  if (
    platform === "web" &&
    (moduleName === "@expo/ui" || moduleName.startsWith("@expo/ui/"))
  ) {
    return { filePath: expoUiWebStub, type: "sourceFile" };
  }
  if (typeof cssResolve === "function") {
    return cssResolve(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withCss;
