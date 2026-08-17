import type { PtScene } from "../core/types";
import type { SceneBox } from "./touched";

export const LIVE_PROTOCOL = "pt-design-live/1" as const;
export const DEFAULT_LIVE_PORT = 4174;

export type LiveSource = "mcp" | "cli" | "file";

export type LiveEvent = {
  v: typeof LIVE_PROTOCOL;
  at: number;
  source: LiveSource;
  tool: string;
  label: string;
  instanceIds: string[];
  elementIds: string[];
  frameIds: string[];
  boxes: SceneBox[];
  scene?: PtScene;
};

export function defaultLiveHttpUrl(): string {
  const raw = typeof process !== "undefined" ? process.env.PT_DESIGN_LIVE_URL : undefined;
  if (raw) return raw.replace(/\/$/, "");
  const port = Number(
    (typeof process !== "undefined" ? process.env.PT_DESIGN_LIVE_PORT : undefined) ?? DEFAULT_LIVE_PORT,
  );
  return `http://127.0.0.1:${port}`;
}

export function defaultLiveWsUrl(): string {
  const http = defaultLiveHttpUrl();
  return http.replace(/^http/i, "ws") + "/ws";
}

export function isLiveEvent(value: unknown): value is LiveEvent {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  return rec.v === LIVE_PROTOCOL && typeof rec.tool === "string" && Array.isArray(rec.instanceIds);
}

export function normalizeLiveEvent(event: LiveEvent): LiveEvent {
  return {
    ...event,
    elementIds: Array.isArray(event.elementIds) ? event.elementIds : [],
    frameIds: Array.isArray(event.frameIds) ? event.frameIds : [],
    boxes: Array.isArray(event.boxes) ? event.boxes : [],
  };
}
