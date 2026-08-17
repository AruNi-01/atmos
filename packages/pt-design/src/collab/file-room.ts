import { openDesignDocument } from "../core/document";
import { roomFromEnv } from "./publish";
import type { CollabRoom } from "./constants";

export async function resolveFileCollabRoom(path?: string): Promise<CollabRoom | null> {
  const fromEnv = roomFromEnv();
  if (fromEnv) return fromEnv;
  if (!path) return null;
  try {
    return openDesignDocument(path).collab ?? null;
  } catch {
    return null;
  }
}
