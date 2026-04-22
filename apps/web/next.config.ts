import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

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
  ...devHeadersConfig,
};

export default withNextIntl(nextConfig);
