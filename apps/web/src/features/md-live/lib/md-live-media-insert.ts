import { fsApi } from "@/api/ws-api";
import { pickLocalFile, type NativePathFilter } from "@/shared/lib/desktop-directory-picker";
import {
  mdLiveMediaMarkdown,
  type MdLiveMediaKind,
  type MdLiveMediaOpenKind,
} from "@atmos/md-live/ui";
import {
  classifyPickedMedia,
  mediaKindFromOpen,
  documentDirectory,
  isPathInsideRoot,
  mediaLibraryDir,
  nextAvailableName,
  posixBasename,
  posixRelative,
} from "./md-live-media-path";

const FILTERS: Record<MdLiveMediaOpenKind, NativePathFilter[]> = {
  image: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp"] }],
  video: [{ name: "Videos", extensions: ["mp4", "webm", "mov", "m4v"] }],
  audio: [{ name: "Audio", extensions: ["mp3", "wav", "flac", "aac", "m4a", "ogg"] }],
  file: [],
};

export async function insertMdLiveMedia(options: {
  kind: MdLiveMediaOpenKind;
  documentPath: string;
  workspaceRoot: string | null;
}): Promise<string | null> {
  const picked = await pickLocalFile({
    title: "Insert media",
    filters: FILTERS[options.kind].length > 0 ? FILTERS[options.kind] : undefined,
  });
  if (picked.status !== "picked") return null;
  if (picked.path.startsWith("data:")) {
    const kind: MdLiveMediaKind =
      options.kind === "image" ? "img"
        : options.kind === "video" ? "video"
          : options.kind === "audio" ? "audio"
            : "file";
    return mdLiveMediaMarkdown(kind, options.kind, picked.path);
  }

  const sourcePath = picked.path;
  const kind = classifyPickedMedia(
    sourcePath,
    options.kind === "file" ? undefined : mediaKindFromOpen(options.kind),
  );
  const fileName = posixBasename(sourcePath);
  const workspaceRoot = options.workspaceRoot;
  const fromDir = documentDirectory(options.documentPath, workspaceRoot);
  if (workspaceRoot && isPathInsideRoot(workspaceRoot, sourcePath) && fromDir) {
    return mdLiveMediaMarkdown(kind, fileName, posixRelative(fromDir, sourcePath));
  }
  if (!workspaceRoot || !fromDir) return null;

  const dir = mediaLibraryDir(workspaceRoot, kind);
  await fsApi.createDir(dir);
  const listing = await fsApi.listDir(dir, { dirsOnly: false, showHidden: true, ignoreNotFound: true });
  const existing = new Set((listing.entries ?? []).map((entry) => entry.name));
  const destName = nextAvailableName(existing, fileName);
  const destPath = `${dir}/${destName}`;
  await fsApi.duplicatePath(sourcePath, destPath);
  return mdLiveMediaMarkdown(kind, destName, posixRelative(fromDir, destPath));
}
