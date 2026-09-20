import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { existsSync } from "node:fs";
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
// Prefer apps/web/node_modules (bun workspace install layout). Fall back to
// monorepo root only when the package is hoisted there.
const codemirrorWebpackAliases = Object.fromEntries(
  codemirrorPackages.map((packageName) => {
    const webLocal = path.join(
      webAppDir,
      "node_modules",
      ...packageName.split("/"),
    );
    const rootHoisted = path.join(
      repoRoot,
      "node_modules",
      ...packageName.split("/"),
    );
    return [
      packageName,
      existsSync(webLocal) ? webLocal : rootHoisted,
    ];
  }),
);

const isDev = process.env.NODE_ENV === "development";
const isDesktop = process.env.BUILD_TARGET === "desktop";
const isLocalRuntime = process.env.BUILD_TARGET === "local-web";
const isPages = process.env.BUILD_TARGET === "pages";
const isStaticExportTarget = isDesktop || isLocalRuntime || isPages;
const devApiPort = process.env.NEXT_PUBLIC_API_PORT || "30303";

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

const devRewritesConfig =
  !isStaticExportTarget && isDev
    ? {
        async rewrites() {
          // Browser dev (e.g. :3030): proxy REST to loopback API so POST preflight stays same-origin.
          return [
            {
              source: "/api/:path*",
              destination: `http://127.0.0.1:${devApiPort}/api/:path*`,
            },
            {
              source: "/hooks/:path*",
              destination: `http://127.0.0.1:${devApiPort}/hooks/:path*`,
            },
            {
              source: "/tok/:handle*",
              destination: "/tok",
            },
          ];
        },
      }
    : {};

const nextConfig: NextConfig = {
  transpilePackages: [
    "@pierre/diffs",
    "@atmos/pt-design",
    "@excalidraw/excalidraw",
    "emoji-mart",
    "@emoji-mart/data",
  ],
  output: isStaticExportTarget ? "export" : undefined,
  // Generate directory indexes so static file servers can resolve app routes
  // consistently with trailing slash URLs.
  trailingSlash: isStaticExportTarget,
  images: {
    unoptimized: isStaticExportTarget,
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "*.googleusercontent.com" },
    ],
  },
  allowedDevOrigins: ["*"],
  // View transitions are stable in Next.js 16.3+ (no experimental flag).
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
  ...devRewritesConfig,
  ...devHeadersConfig,
};

export default withNextIntl(nextConfig);
