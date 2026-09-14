import { roomFromEnv } from "./publish";
import type { CollabRoom } from "./constants";

export async function resolveFileCollabRoom(_path?: string): Promise<CollabRoom | null> {
  return roomFromEnv();
}
