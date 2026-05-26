import { toastManager } from "@workspace/ui";

import { appApi } from "@/api/ws-api";

export async function openArtifactPath(path: string) {
  if (!path) return;
  try {
    await appApi.openWith("Finder", path);
    toastManager.add({
      title: "Opened path",
      description: path,
      type: "success",
    });
  } catch (err) {
    toastManager.add({
      title: "Failed to open path",
      description: err instanceof Error ? err.message : "Unknown error",
      type: "error",
    });
  }
}
