import { NextResponse } from "next/server";

const RELEASES_LATEST_URL = "https://github.com/AruNi-01/atmos/releases/latest";
const LATEST_JSON_URL = "https://github.com/AruNi-01/atmos/releases/latest/download/latest.json";
const GITHUB_REPO_PATH = "/AruNi-01/atmos";

type DownloadLinks = {
  macAppleSilicon: string;
  macIntel: string;
  windows: string;
  linux: string;
};

type TauriPlatformAsset = {
  url?: string;
};

type TauriLatestManifest = {
  platforms?: Record<string, TauriPlatformAsset>;
};

const pickAssetName = (assetNames: string[], matcher: (name: string) => boolean): string | null =>
  assetNames.find((name) => matcher(name)) ?? null;

const toAssetUrl = (tag: string, assetName: string): string =>
  `https://github.com${GITHUB_REPO_PATH}/releases/download/${tag}/${assetName}`;

const createDefaultDownloadLinks = (): DownloadLinks => ({
  macAppleSilicon: RELEASES_LATEST_URL,
  macIntel: RELEASES_LATEST_URL,
  windows: RELEASES_LATEST_URL,
  linux: RELEASES_LATEST_URL,
});

export async function GET() {
  const links = createDefaultDownloadLinks();

  try {
    const latestRes = await fetch(LATEST_JSON_URL, {
      next: { revalidate: 3600 },
      headers: { Accept: "application/json" },
    });

    if (!latestRes.ok) {
      return NextResponse.json(links);
    }

    const data = (await latestRes.json()) as TauriLatestManifest;
    const platforms = data.platforms ?? {};
    const anyPlatformUrl = Object.values(platforms).find((asset) => typeof asset.url === "string")?.url;
    const tag = anyPlatformUrl?.match(/\/releases\/download\/([^/]+)\//)?.[1];

    if (!tag) {
      return NextResponse.json(links);
    }

    const assetsRes = await fetch(`https://github.com${GITHUB_REPO_PATH}/releases/expanded_assets/${tag}`, {
      next: { revalidate: 3600 },
      headers: { Accept: "text/html" },
    });

    if (!assetsRes.ok) {
      return NextResponse.json(links);
    }

    const assetsHtml = await assetsRes.text();
    const downloadPathRegex = new RegExp(
      `${GITHUB_REPO_PATH.replace(/\//g, "\\/")}\\/releases\\/download\\/${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\/([^"?#]+)`,
      "g",
    );
    const assetNames = Array.from(assetsHtml.matchAll(downloadPathRegex))
      .map((match) => decodeURIComponent(match[1]))
      .filter((name) => !name.endsWith(".sig") && name !== "latest.json");

    const macArmDmg = pickAssetName(assetNames, (name) => name.endsWith(".dmg") && /aarch64|arm64/i.test(name));
    const macIntelDmg = pickAssetName(assetNames, (name) => name.endsWith(".dmg") && /(x64|x86_64|intel)/i.test(name));
    const windowsInstaller = pickAssetName(assetNames, (name) => name.endsWith(".exe")) ??
      pickAssetName(assetNames, (name) => name.endsWith(".msi"));
    const linuxInstaller = pickAssetName(assetNames, (name) => name.endsWith(".AppImage")) ??
      pickAssetName(assetNames, (name) => name.endsWith(".deb"));

    if (macArmDmg) {
      links.macAppleSilicon = toAssetUrl(tag, macArmDmg);
    }

    if (macIntelDmg) {
      links.macIntel = toAssetUrl(tag, macIntelDmg);
    }

    if (windowsInstaller) {
      links.windows = toAssetUrl(tag, windowsInstaller);
    }

    if (linuxInstaller) {
      links.linux = toAssetUrl(tag, linuxInstaller);
    }

    return NextResponse.json(links);
  } catch {
    return NextResponse.json(links);
  }
}
