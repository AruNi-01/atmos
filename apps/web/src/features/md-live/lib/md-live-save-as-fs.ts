import { nextUntitledMarkdownName } from "@atmos/md-live";
import { fsApi } from "@/api/ws-api";

export async function suggestedUntitledName(directory: string): Promise<string> {
  const listing = await fsApi.listDir(directory, {
    dirsOnly: false,
    showHidden: false,
    ignoreNotFound: true,
  });
  const names = listing.entries.filter((e) => !e.is_dir).map((e) => e.name);
  return nextUntitledMarkdownName(names);
}

export async function pathExistsInDir(directory: string, fileName: string): Promise<boolean> {
  const listing = await fsApi.listDir(directory, {
    dirsOnly: false,
    showHidden: false,
    ignoreNotFound: true,
  });
  return listing.entries.some((e) => !e.is_dir && e.name === fileName);
}
