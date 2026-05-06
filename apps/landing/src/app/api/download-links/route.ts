import { NextResponse } from "next/server";

import { fetchLatestDesktopRelease, GITHUB_RELEASES_URL, type GitHubReleaseAsset } from "@/lib/github-desktop-release";

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

export async function GET() {
  const links = createDefaultDownloadLinks();

  try {
    const desktopRelease = await fetchLatestDesktopRelease();
    const assets = desktopRelease?.assets.filter((asset) => !asset.name.endsWith(".sig") && asset.name !== "latest.json") ?? [];

    const macArmDmg = pickAsset(assets, (name) => name.endsWith(".dmg") && /aarch64|arm64/i.test(name));
    const macIntelDmg = pickAsset(assets, (name) => name.endsWith(".dmg") && /(x64|x86_64|intel)/i.test(name));
    const windowsInstaller = pickAsset(assets, (name) => name.endsWith(".exe")) ?? pickAsset(assets, (name) => name.endsWith(".msi"));
    const linuxInstaller = pickAsset(assets, (name) => name.endsWith(".AppImage")) ?? pickAsset(assets, (name) => name.endsWith(".deb"));

    if (macArmDmg) {
      links.macAppleSilicon = macArmDmg.browser_download_url;
    }

    if (macIntelDmg) {
      links.macIntel = macIntelDmg.browser_download_url;
    }

    if (windowsInstaller) {
      links.windows = windowsInstaller.browser_download_url;
    }

    if (linuxInstaller) {
      links.linux = linuxInstaller.browser_download_url;
    }

    return NextResponse.json(links);
  } catch {
    return NextResponse.json(links);
  }
}
