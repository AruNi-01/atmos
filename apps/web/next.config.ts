import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const isDev = process.env.NODE_ENV === "development";
const isDesktop = process.env.BUILD_TARGET === "desktop";

const devHeadersConfig = !isDesktop
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
  output: isDesktop ? "export" : undefined,
  // Generate en/index.html instead of en.html so static file servers
  // can resolve /en/ correctly (ServeDir append_index_html).
  trailingSlash: isDesktop,
  images: { unoptimized: isDesktop },
  allowedDevOrigins: ["*"],
  ...devHeadersConfig,
};

export default withNextIntl(nextConfig);
