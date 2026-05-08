import { NextResponse } from "next/server";

import { fetchLatestDesktopRelease, GITHUB_RELEASES_URL, type GitHubReleaseAsset } from "@/lib/github-desktop-release";

const R2_BASE_URL = "https://install.atmos.land/desktop";

type DownloadLinks = {
  macAppleSilicon: string;
  macIntel: string;
  windows: string;
  linux: string;
};

const pickAsset = (assets: GitHubReleaseAsset[], matcher: (name: string) => boolean): GitHubReleaseAsset | null =>
  assets.find((asset) => matcher(asset.name)) ?? null;

const createDefaultDownloadLinks = (): DownloadLinks => ({
  macAppleSilicon: GITHUB_RELEASES_URL,
  macIntel: GITHUB_RELEASES_URL,
  windows: GITHUB_RELEASES_URL,
  linux: GITHUB_RELEASES_URL,
});

const createR2DownloadLinks = (tag: string, assets: GitHubReleaseAsset[]): DownloadLinks => {
  const links: DownloadLinks = {
    macAppleSilicon: GITHUB_RELEASES_URL,
    macIntel: GITHUB_RELEASES_URL,
    windows: GITHUB_RELEASES_URL,
    linux: GITHUB_RELEASES_URL,
  };

  const macArmDmg = pickAsset(assets, (name) => name.endsWith(".dmg") && /aarch64|arm64/i.test(name));
  const macIntelDmg = pickAsset(assets, (name) => name.endsWith(".dmg") && /(x64|x86_64|intel)/i.test(name));
  const windowsInstaller = pickAsset(assets, (name) => name.endsWith(".exe")) ?? pickAsset(assets, (name) => name.endsWith(".msi"));
  const linuxInstaller = pickAsset(assets, (name) => name.endsWith(".AppImage")) ?? pickAsset(assets, (name) => name.endsWith(".deb"));

  if (macArmDmg) {
    links.macAppleSilicon = `${R2_BASE_URL}/${tag}/${macArmDmg.name}`;
  }

  if (macIntelDmg) {
    links.macIntel = `${R2_BASE_URL}/${tag}/${macIntelDmg.name}`;
  }

  if (windowsInstaller) {
    links.windows = `${R2_BASE_URL}/${tag}/${windowsInstaller.name}`;
  }

  if (linuxInstaller) {
    links.linux = `${R2_BASE_URL}/${tag}/${linuxInstaller.name}`;
  }

  return links;
};

export async function GET() {
  const links = createDefaultDownloadLinks();

  try {
    const desktopRelease = await fetchLatestDesktopRelease();
    const assets = desktopRelease?.assets.filter((asset) => !asset.name.endsWith(".sig") && asset.name !== "latest.json") ?? [];

    // Try to use R2 links first
    if (desktopRelease?.tag_name) {
      const r2Links = createR2DownloadLinks(desktopRelease.tag_name, assets);
      
      // Verify R2 links are accessible
      const verifyR2Link = async (url: string): Promise<boolean> => {
        try {
          const response = await fetch(url, { method: 'HEAD' });
          return response.ok;
        } catch {
          return false;
        }
      };

      const [r2MacArmOk, r2MacIntelOk, r2WindowsOk, r2LinuxOk] = await Promise.all([
        verifyR2Link(r2Links.macAppleSilicon),
        verifyR2Link(r2Links.macIntel),
        verifyR2Link(r2Links.windows),
        verifyR2Link(r2Links.linux),
      ]);

      // Use R2 links if they are accessible, otherwise fallback to GitHub
      if (r2MacArmOk) links.macAppleSilicon = r2Links.macAppleSilicon;
      if (r2MacIntelOk) links.macIntel = r2Links.macIntel;
      if (r2WindowsOk) links.windows = r2Links.windows;
      if (r2LinuxOk) links.linux = r2Links.linux;
    }

    // Fallback to GitHub links if R2 is not available
    const macArmDmg = pickAsset(assets, (name) => name.endsWith(".dmg") && /aarch64|arm64/i.test(name));
    const macIntelDmg = pickAsset(assets, (name) => name.endsWith(".dmg") && /(x64|x86_64|intel)/i.test(name));
    const windowsInstaller = pickAsset(assets, (name) => name.endsWith(".exe")) ?? pickAsset(assets, (name) => name.endsWith(".msi"));
    const linuxInstaller = pickAsset(assets, (name) => name.endsWith(".AppImage")) ?? pickAsset(assets, (name) => name.endsWith(".deb"));

    if (!links.macAppleSilicon.startsWith(R2_BASE_URL) && macArmDmg) {
      links.macAppleSilicon = macArmDmg.browser_download_url;
    }

    if (!links.macIntel.startsWith(R2_BASE_URL) && macIntelDmg) {
      links.macIntel = macIntelDmg.browser_download_url;
    }

    if (!links.windows.startsWith(R2_BASE_URL) && windowsInstaller) {
      links.windows = windowsInstaller.browser_download_url;
    }

    if (!links.linux.startsWith(R2_BASE_URL) && linuxInstaller) {
      links.linux = linuxInstaller.browser_download_url;
    }

    return NextResponse.json(links);
  } catch {
    return NextResponse.json(links);
  }
}
