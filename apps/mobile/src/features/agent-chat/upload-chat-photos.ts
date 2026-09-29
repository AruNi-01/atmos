import type { ComposerPhoto } from "./photo-attachment";

export async function uploadChatPhotos(input: {
  gatewayUrl: string;
  token: string;
  chatId: string;
  localPath: string;
  photos: ComposerPhoto[];
}): Promise<string[]> {
  if (input.photos.length === 0) return [];
  const form = new FormData();
  form.append("chat_id", input.chatId);
  form.append("local_path", input.localPath || ".");
  for (const photo of input.photos) {
    form.append("files", {
      uri: photo.uri,
      name: photo.filename || "photo.jpg",
      type: photo.mediaType || "image/jpeg",
    } as unknown as Blob);
  }
  const response = await fetch(`${input.gatewayUrl.replace(/\/$/, "")}/api/agent/upload-attachments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.token}` },
    body: form,
  });
  if (!response.ok) {
    throw new Error("Could not upload that photo.");
  }
  const json = await response.json() as { success?: boolean; message?: string; data?: { paths?: string[] } };
  if (!json.success || !json.data?.paths) {
    throw new Error(json.message || "Could not upload that photo.");
  }
  return json.data.paths;
}
