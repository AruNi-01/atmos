import './global.css';
import type { Metadata } from 'next';

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3001');

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Atmos Docs',
    template: '%s · Atmos Docs',
  },
  description:
    'Documentation for Atmos — desktop app, web workspace, CLI, and Atmos Computer.',
  applicationName: 'Atmos',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
