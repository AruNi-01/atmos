import { FONT_HELVETICA, FONT_VIRGIL, layoutUnboundText } from "../catalog/primitives";
import type { PtElement, PtElementType, PtScene } from "../core/types";
import { canonicalColor, displayColor } from "./theme-palette";

export type ExcalidrawCompatElement = PtElement & {
  strokeStyle: "solid" | "dashed" | "dotted";
  version: number;
  link: string | null;
  index: string | null;
};

export type ExcalidrawHostApi = {
  updateScene: (input: {
    elements?: ExcalidrawCompatElement[];
    appState?: {
      viewBackgroundColor?: string;
      theme?: "light" | "dark";
      currentItemRoughness?: number;
      currentItemFontFamily?: number;
    };
  }) => void;
  getSceneElements: () => readonly ExcalidrawCompatElement[];
  getSceneElementsIncludingDeleted: () => readonly ExcalidrawCompatElement[];
  getAppState: () => {
    scrollX: number;
    scrollY: number;
    zoom: { value: number };
    width: number;
    height: number;
    viewBackgroundColor: string;
    selectedElementIds: Record<string, boolean>;
  };
};

const KNOWN_TYPES = new Set<string>([
  "rectangle",
  "ellipse",
  "text",
  "line",
  "arrow",
  "frame",
  "freedraw",
  "diamond",
  "image",
]);

export function sceneToExcalidrawElements(
  scene: PtScene,
  theme: "light" | "dark" = "light",
): ExcalidrawCompatElement[] {
  return scene.elements.map((el) => toCompat(el, theme));
}

export function excalidrawElementsToScene(
  elements: readonly ExcalidrawCompatElement[],
  appState?: { viewBackgroundColor?: string },
  theme: "light" | "dark" = "light",
): PtScene {
  return {
    elements: elements
      .filter((el) => el.type !== ("selection" as PtElementType))
      .map((el) => fromCompat(el, theme)),
    appState: {
      viewBackgroundColor: canonicalColor(
        appState?.viewBackgroundColor ?? "#ffffff",
        theme,
      ),
    },
  };
}

export function sceneFingerprint(scene: PtScene): string {
  return scene.elements
    .filter((el) => !el.isDeleted)
    .map((el) =>
      [
        el.id,
        el.type,
        el.x,
        el.y,
        el.width,
        el.height,
        el.frameId ?? "",
        el.text ?? "",
        el.name ?? "",
        el.customData?.pt?.instanceId ?? "",
        el.customData?.pt?.componentType ?? "",
        JSON.stringify(el.customData?.pt?.props ?? {}),
      ].join(":"),
    )
    .join("|");
}

function toCompat(el: PtElement, theme: "light" | "dark"): ExcalidrawCompatElement {
  const textBox = el.type === "text" ? layoutUnboundText(el) : null;
  return {
    ...el,
    strokeColor: displayColor(el.strokeColor, theme),
    backgroundColor: displayColor(el.backgroundColor, theme),
    strokeStyle: el.strokeStyle ?? "solid",
    version: el.version ?? 1,
    link: el.link ?? null,
    index: el.index ?? null,
    angle: el.angle ?? 0,
    groupIds: el.groupIds ?? [],
    frameId: el.frameId ?? null,
    boundElements: el.boundElements ?? null,
    locked: el.locked ?? false,
    isDeleted: el.isDeleted ?? false,
    roughness: el.roughness ?? 1,
    opacity: el.opacity ?? 100,
    fillStyle: el.fillStyle ?? "solid",
    y: textBox?.y ?? el.y,
    height: textBox?.height ?? el.height,
    fontFamily: el.type === "text" ? visibleTextFont(el.fontFamily) : el.fontFamily,
    lineHeight: el.type === "text" ? (el.lineHeight ?? 1.25) : el.lineHeight,
    autoResize: el.type === "text" ? (el.autoResize ?? false) : el.autoResize,
    containerId: el.type === "text" ? (el.containerId ?? null) : el.containerId,
  };
}

function fromCompat(el: ExcalidrawCompatElement, theme: "light" | "dark"): PtElement {
  const type = KNOWN_TYPES.has(el.type) ? (el.type as PtElementType) : "rectangle";
  return {
    ...el,
    type,
    strokeColor: canonicalColor(el.strokeColor, theme),
    backgroundColor: canonicalColor(el.backgroundColor, theme),
    fontFamily: el.type === "text" ? visibleTextFont(el.fontFamily) : el.fontFamily,
    groupIds: [...(el.groupIds ?? [])],
    frameId: el.frameId ?? null,
    customData: el.customData,
  };
}

/** Virgil (1) is a downloaded face — fall back to local Helvetica so labels stay visible. */
export function visibleTextFont(fontFamily: number | undefined): number {
  if (!fontFamily || fontFamily === FONT_VIRGIL) return FONT_HELVETICA;
  return fontFamily;
}
