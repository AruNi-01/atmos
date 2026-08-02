import { NextResponse } from "next/server";

import { resolveDesktopDownloadLinks } from "@/lib/desktop-download-links";

export async function GET() {
  const links = await resolveDesktopDownloadLinks();
  return NextResponse.json(links);
}
