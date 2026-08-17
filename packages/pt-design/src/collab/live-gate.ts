import { PT_ERROR_CODES, PtDesignError } from "../agent/errors";
import { isLiveMutatingTool } from "../agent/mutating";
import type { FileSession } from "../agent/api";
import { resolveFileCollabRoom } from "./file-room";
import { publishAgentScene, pullLiveScene } from "./publish";
import { resolveCollaboratorName } from "./names";
import type { CollabRoom } from "./constants";

export const LIVE_COLLAB_REQUIRED_MESSAGE =
  "The live Prototype Design board requires a collaboration room. Ask the user to click Share first, then join with PT_DESIGN_COLLAB_ROOM=id,key. Do not edit a separate .ptdesign.json copy of their open board.";

export async function resolveLiveRoom(path?: string | null): Promise<CollabRoom | null> {
  return resolveFileCollabRoom(path ?? undefined);
}

export async function prepareLiveSession(
  fs: FileSession,
  name: string,
): Promise<CollabRoom | null> {
  const room = await resolveLiveRoom(fs.path);
  if (isLiveMutatingTool(name) && !fs.path && !room) {
    throw new PtDesignError(PT_ERROR_CODES.COLLAB_REQUIRED, LIVE_COLLAB_REQUIRED_MESSAGE);
  }
  if (!room) return null;
  const needsScene =
    isLiveMutatingTool(name) || name === "pt_ir_get" || name === "pt_scene_get" || name === "pt_frames_list";
  if (needsScene) {
    const live = await pullLiveScene({ room, username: resolveCollaboratorName("agent") });
    if (live) fs.session.dispatch({ type: "replaceScene", scene: live });
  }
  return room;
}

export async function publishLiveSession(fs: FileSession, room: CollabRoom | null): Promise<void> {
  if (!room) return;
  const scene = fs.session.getScene();
  const box = scene.elements.find((el) => !el.isDeleted);
  await publishAgentScene({
    room,
    elements: scene.elements,
    username: resolveCollaboratorName("agent"),
    pointer: box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : undefined,
  });
}
