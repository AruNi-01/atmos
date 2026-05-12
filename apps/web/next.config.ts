import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import path from "node:path";
import { fileURLToPath } from "node:url";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const webAppDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(webAppDir, "../..");
const codemirrorPackages = [
  "@codemirror/autocomplete",
  "@codemirror/commands",
  "@codemirror/lang-cpp",
  "@codemirror/lang-css",
  "@codemirror/lang-go",
  "@codemirror/lang-html",
  "@codemirror/lang-java",
  "@codemirror/lang-javascript",
  "@codemirror/lang-json",
  "@codemirror/lang-markdown",
  "@codemirror/lang-php",
  "@codemirror/lang-python",
  "@codemirror/lang-rust",
  "@codemirror/lang-sql",
  "@codemirror/lang-vue",
  "@codemirror/lang-xml",
  "@codemirror/lang-yaml",
  "@codemirror/language",
  "@codemirror/legacy-modes",
  "@codemirror/lint",
  "@codemirror/merge",
  "@codemirror/search",
  "@codemirror/state",
  "@codemirror/theme-one-dark",
  "@codemirror/view",
] as const;
const codemirrorTurbopackAliases = Object.fromEntries(
  codemirrorPackages.map((packageName) => [
    packageName,
    `./node_modules/${packageName}`,
  ]),
);
const codemirrorWebpackAliases = Object.fromEntries(
  codemirrorPackages.map((packageName) => [
    packageName,
    path.join(repoRoot, "node_modules", ...packageName.split("/")),
  ]),
);

const isDev = process.env.NODE_ENV === "development";
const isDesktop = process.env.BUILD_TARGET === "desktop";
const isLocalRuntime = process.env.BUILD_TARGET === "local-web";
const isStaticExportTarget = isDesktop || isLocalRuntime;

const devHeadersConfig = !isStaticExportTarget
  ? {
      async headers() {
        if (!isDev) return [];
        return [
          {
            source: "/(.*)",
            headers: [
              { key: "Access-Control-Allow-Origin", value: "*" },
              { key: "Access-Control-Allow-Methods", value: "GET, POST, PUT, DELETE, OPTIONS" },
              { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
            ],
          },
        ];
      },
    }
  : {};

const nextConfig: NextConfig = {
  output: isStaticExportTarget ? "export" : undefined,
  // Generate en/index.html instead of en.html so static file servers
  // can resolve /en/ correctly (ServeDir append_index_html).
  trailingSlash: isStaticExportTarget,
  images: { unoptimized: isStaticExportTarget },
  allowedDevOrigins: ["*"],
  experimental: { viewTransition: true },
  turbopack: {
    root: repoRoot,
    resolveAlias: codemirrorTurbopackAliases,
  },
  webpack: (config) => {
    config.resolve ??= {};
    config.resolve.alias ??= {};
    if (typeof config.resolve.alias === "object" && !Array.isArray(config.resolve.alias)) {
      Object.assign(config.resolve.alias, codemirrorWebpackAliases);
    }
    return config;
  },
  ...devHeadersConfig,
};

export default withNextIntl(nextConfig);
