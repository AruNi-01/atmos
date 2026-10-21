import type { SessionBucket } from "./session-inbox";

export type SessionBucketHref = {
  pathname: "/(home)/session/[bucket]";
  params: { bucket: SessionBucket };
};

export type WorkspaceEntryHref = {
  pathname: "/workspace/[workspaceId]";
  params: { workspaceId: string };
};

/** Plain href for a Session card. No fetch. */
export function openSessionBucketHref(bucket: SessionBucket): SessionBucketHref {
  return {
    pathname: "/(home)/session/[bucket]",
    params: { bucket },
  };
}

/** Plain href for a Workspace row. No fetch. */
export function openWorkspaceEntryHref(workspaceId: string): WorkspaceEntryHref {
  return {
    pathname: "/workspace/[workspaceId]",
    params: { workspaceId },
  };
}
