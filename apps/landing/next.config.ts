import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const isPages = process.env.BUILD_TARGET === "pages";

const nextConfig: NextConfig = {
  output: isPages ? "export" : undefined,
  trailingSlash: isPages ? false : undefined,
  images: {
    unoptimized: isPages,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "plus.unsplash.com",
      },
    ],
  },
};

export default withNextIntl(nextConfig);
