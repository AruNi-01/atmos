export const PHOTO_LIMIT = 20;

export type ComposerPhoto = {
  id: string;
  uri: string;
  filename: string;
  mediaType: string;
};

export function appendPhotos(current: readonly ComposerPhoto[], next: readonly ComposerPhoto[]): ComposerPhoto[] {
  const seen = new Set(current.map((photo) => photo.id));
  const merged = [...current];
  for (const photo of next) {
    if (merged.length >= PHOTO_LIMIT) break;
    if (!photo.uri.trim() || seen.has(photo.id)) continue;
    seen.add(photo.id);
    merged.push(photo);
  }
  return merged;
}
