"use client";

import { useEditor } from "tldraw";

import type { CanvasAgentBridgeState } from "../hooks/use-canvas-agent-bridge";
import { CanvasAgentViewHighlight } from "./CanvasAgentViewHighlight";

/**
 * Renders on tldraw's `OnTheCanvas` layer (page-space, camera-transformed).
 * Must not be a direct `<Tldraw>` child — `SVGContainer` only works here.
 */
export function CanvasAgentOnCanvas({
  bridge,
}: {
  bridge: CanvasAgentBridgeState;
}) {
  const editor = useEditor();
  return <CanvasAgentViewHighlight bridge={bridge} editor={editor} />;
}
