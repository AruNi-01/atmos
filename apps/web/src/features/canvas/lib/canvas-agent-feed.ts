"use client";

/**
 * Canvas adapter around the shared agent-surface feed.
 * Command labels stay canvas-specific; the island UI is shared.
 */

import { describeCanvasAgentCommand } from "./canvas-agent-feed-labels";
import {
  AGENT_SURFACE_FEED_BATCH_GAP_MS,
  AGENT_SURFACE_FEED_STALE_MS,
  AgentSurfaceFeedStore,
} from "@/shared/lib/agent-surface-feed";

export const CANVAS_AGENT_FEED_BATCH_GAP_MS = AGENT_SURFACE_FEED_BATCH_GAP_MS;
export const CANVAS_AGENT_FEED_STALE_MS = AGENT_SURFACE_FEED_STALE_MS;

export type {
  AgentSurfaceFeedEntry as CanvasAgentFeedEntry,
  AgentSurfaceFeedEntryStatus as CanvasAgentFeedEntryStatus,
  AgentSurfaceFeedScreenshot as CanvasAgentFeedScreenshot,
  AgentSurfaceFeedBatch as CanvasAgentFeedBatch,
  AgentSurfaceFeedSnapshot as CanvasAgentFeedSnapshot,
  AgentSurfaceFeedStore,
} from "@/shared/lib/agent-surface-feed";

export class CanvasAgentFeedStore extends AgentSurfaceFeedStore {
  constructor() {
    super(describeCanvasAgentCommand);
  }
}
