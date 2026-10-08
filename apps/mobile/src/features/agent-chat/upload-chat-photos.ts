import { Directory, File, Paths } from "expo-file-system";
import type { ComposerPhoto } from "./photo-attachment";

function safeName(name: string): string {
  const cleaned = name.trim().replace(/[\\/]/g, "_");
  return cleaned.length > 0 ? cleaned : "photo.jpg";
}

async function readPhotoBytes(uri: string): Promise<Uint8Array> {
  try {
    return await new File(uri).bytes();
  } catch {
    const response = await fetch(uri);
    if (!response.ok) throw new Error("Could not upload that photo.");
    return new Uint8Array(await response.arrayBuffer());
  }
}

/**
 * Expo fetch rejects React Native's `{ uri, name, type }` FormData part
 * ("Unsupported FormDataPart implementation") and cannot build a Blob from
 * raw bytes. A `File` with `bytes()` is a supported part.
 */
async function chatUploadFile(photo: ComposerPhoto): Promise<File> {
  const filename = safeName(photo.filename || "photo.jpg");
  const source = new File(photo.uri);
  if (source.uri.startsWith("file:") && source.name === filename) return source;
  const dir = new Directory(Paths.cache, "atmos-chat-uploads");
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const dest = new File(dir, `${Date.now()}-${filename}`);
  if (!dest.exists) dest.create();
  dest.write(await readPhotoBytes(photo.uri));
  return dest;
}

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
    form.append("files", await chatUploadFile(photo));
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
