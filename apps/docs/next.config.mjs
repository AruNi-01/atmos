import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: '/atmos-computer', destination: '/workflows/remote-build', permanent: true },
      { source: '/atmos-computer/:path*', destination: '/workflows/remote-build', permanent: true },
      { source: '/zh/atmos-computer', destination: '/zh/workflows/remote-build', permanent: true },
      { source: '/zh/atmos-computer/:path*', destination: '/zh/workflows/remote-build', permanent: true },
      { source: '/reference/faq', destination: '/reference/troubleshooting', permanent: true },
      { source: '/reference/environment', destination: '/reference/troubleshooting', permanent: true },
      { source: '/zh/reference/faq', destination: '/zh/reference/troubleshooting', permanent: true },
      { source: '/zh/reference/environment', destination: '/zh/reference/troubleshooting', permanent: true },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/:path*.mdx',
        destination: '/llms.mdx/:path*',
      },
      {
        source: '/docs',
        destination: '/introduction',
      },
      {
        source: '/docs/:path*',
        destination: '/:path*',
      },
      {
        source: '/zh/docs',
        destination: '/zh/introduction',
      },
      {
        source: '/zh/docs/:path*',
        destination: '/zh/:path*',
      },
    ];
  },
};

export default withMDX(config);
