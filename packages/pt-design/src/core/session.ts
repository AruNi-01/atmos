import {
  defaultProps,
  getCatalogEntry,
  getComponentTemplate,
  listComponentTypes,
  sanitizeProps,
} from "../catalog/registry";
import { nextPlaceOffset, resolvePlaceVariants, showcaseProps } from "../catalog/place-sets";
import { applyDesignIR } from "../ir/apply";
import { encodeDesignIR } from "../ir/encode";
import { buildHandoffPayload, type HandoffPayload } from "../ir/handoff";
import type { DesignIR } from "../ir/schema";
import { frameEl } from "../catalog/primitives";
import { PT_ERROR_CODES, PtDesignError } from "../agent/errors";
import { createId } from "./ids";
import { emptyScene, type BBox, type PtElement, type PtProps, type PtScene, type PtSize } from "./types";

export type PtDesignCommand =
  | {
      type: "place";
      componentType: string;
      at: { x: number; y: number };
      props?: PtProps;
      variant?: string;
      size?: PtSize;
      frameId?: string;
      instanceId?: string;
    }
  | {
      type: "update";
      instanceId: string;
      props?: PtProps;
      variant?: string;
      size?: PtSize;
      bbox?: Partial<BBox>;
    }
  | { type: "delete"; instanceIds: string[] }
  | { type: "createFrame"; name: string; bbox: BBox }
  | { type: "renameFrame"; frameId: string; name: string }
  | { type: "replaceScene"; scene: PtScene }
  | { type: "applyIR"; ir: DesignIR; mode: "merge" | "replace" };

export type PtDesignSnapshot = {
  scene: PtScene;
};

export type PtDesignSession = {
  dispatch(cmd: PtDesignCommand): { instanceId?: string; instanceIds?: string[]; frameId?: string };
  getScene(): PtScene;
  getIR(options?: { frameId?: string; instanceIds?: string[] }): DesignIR;
  listCatalog(): { componentType: string; variants?: string[] }[];
  getSelection(): string[];
  setSelection(ids: string[]): void;
  subscribe(fn: (snap: PtDesignSnapshot) => void): () => void;
  buildHandoff(input: {
    scope: "selection" | "frame" | "document";
    frameId?: string;
    instanceIds?: string[];
    prompt?: string;
    includeImage?: boolean;
    clientId?: string;
    invokeUrl?: string;
    collab?: { roomId: string; roomKey: string; shareUrl: string };
  }): HandoffPayload;
  resolveFrame(frameIdOrName?: string): PtElement | undefined;
};

export function createPtDesignSession(initial?: PtScene): PtDesignSession {
  let scene: PtScene = initial ?? emptyScene();
  let selection: string[] = [];
  const listeners = new Set<(snap: PtDesignSnapshot) => void>();

  const emit = () => {
    const snap = { scene };
    for (const fn of listeners) fn(snap);
  };

  const roots = () =>
    scene.elements.filter((el) => !el.isDeleted && el.customData?.pt?.componentType);

  const findRoot = (instanceId: string) =>
    roots().find((el) => el.customData?.pt?.instanceId === instanceId);

  const resolveFrame = (frameIdOrName?: string): PtElement | undefined => {
    if (!frameIdOrName) return undefined;
    const frames = scene.elements.filter((el) => el.type === "frame" && !el.isDeleted);
    const byId = frames.find((el) => el.id === frameIdOrName);
    if (byId) return byId;
    const byName = frames.filter((el) => el.name === frameIdOrName);
    if (byName.length > 1) {
      throw new PtDesignError(
        PT_ERROR_CODES.FRAME_AMBIGUOUS,
        `Multiple frames named ${frameIdOrName}`,
      );
    }
    return byName[0];
  };

  const dispatch: PtDesignSession["dispatch"] = (cmd) => {
    if (cmd.type === "replaceScene") {
      scene = cmd.scene;
      emit();
      return {};
    }
    if (cmd.type === "applyIR") {
      scene = applyDesignIR(scene, cmd.ir, cmd.mode);
      emit();
      return {};
    }
    if (cmd.type === "createFrame") {
      const frame = frameEl(cmd.bbox.x, cmd.bbox.y, cmd.bbox.w, cmd.bbox.h, cmd.name);
      scene = { ...scene, elements: [...scene.elements, frame] };
      emit();
      return { frameId: frame.id };
    }
    if (cmd.type === "renameFrame") {
      const frame = resolveFrame(cmd.frameId);
      if (!frame) {
        throw new PtDesignError(PT_ERROR_CODES.NOT_FOUND, `Frame not found: ${cmd.frameId}`);
      }
      scene = {
        ...scene,
        elements: scene.elements.map((el) =>
          el.id === frame.id ? { ...el, name: cmd.name } : el,
        ),
      };
      emit();
      return { frameId: frame.id };
    }
    if (cmd.type === "place") {
      getCatalogEntry(cmd.componentType);
      const baseProps = { ...defaultProps(cmd.componentType), ...sanitizeProps(cmd.componentType, cmd.props ?? {}) };
      const frame = resolveFrame(cmd.frameId);
      if (cmd.frameId && !frame) {
        throw new PtDesignError(PT_ERROR_CODES.NOT_FOUND, `Frame not found: ${cmd.frameId}`);
      }
      const variants =
        cmd.instanceId || cmd.variant
          ? [cmd.variant ?? "default"]
          : resolvePlaceVariants(cmd.componentType);
      let cursor = { x: cmd.at.x, y: cmd.at.y };
      let firstId: string | undefined;
      const instanceIds: string[] = [];
      const nextElements = scene.elements.slice();
      variants.forEach((variant, index) => {
        const built = getComponentTemplate(cmd.componentType, {
          x: cursor.x,
          y: cursor.y,
          variant,
          size: cmd.size,
          props: showcaseProps(cmd.componentType, variant, index, baseProps),
          instanceId: index === 0 ? cmd.instanceId : undefined,
        });
        firstId ??= built.instanceId;
        instanceIds.push(built.instanceId);
        nextElements.push(
          ...built.elements.map((el) => ({
            ...el,
            frameId: frame?.id ?? null,
          })),
        );
        cursor = nextPlaceOffset(
          cmd.componentType,
          index,
          { x: cursor.x, y: cursor.y, width: built.width, height: built.height },
          cmd.at,
        );
      });
      scene = { ...scene, elements: nextElements };
      emit();
      return { instanceId: firstId, instanceIds };
    }
    if (cmd.type === "update") {
      const root = findRoot(cmd.instanceId);
      if (!root) {
        throw new PtDesignError(PT_ERROR_CODES.NOT_FOUND, `Instance not found: ${cmd.instanceId}`);
      }
      const meta = root.customData?.pt;
      if (!meta?.componentType) {
        throw new PtDesignError(PT_ERROR_CODES.NOT_FOUND, `Instance not found: ${cmd.instanceId}`);
      }
      const nextProps = sanitizeProps(meta.componentType, {
        ...(meta.props ?? {}),
        ...(cmd.props ?? {}),
      });
      const x = cmd.bbox?.x ?? root.x;
      const y = cmd.bbox?.y ?? root.y;
      const built = getComponentTemplate(meta.componentType, {
        x,
        y,
        variant: cmd.variant ?? meta.variant,
        size: cmd.size ?? meta.size,
        props: nextProps,
        instanceId: cmd.instanceId,
      });
      const frameId = root.frameId;
      scene = {
        ...scene,
        elements: [
          ...scene.elements.filter((el) => el.customData?.pt?.instanceId !== cmd.instanceId),
          ...built.elements.map((el) => ({ ...el, frameId })),
        ],
      };
      emit();
      return { instanceId: cmd.instanceId, instanceIds: [cmd.instanceId] };
    }
    if (cmd.type === "delete") {
      const ids = new Set(cmd.instanceIds);
      scene = {
        ...scene,
        elements: scene.elements.filter((el) => !ids.has(el.customData?.pt?.instanceId ?? "")),
      };
      emit();
      return { instanceIds: cmd.instanceIds };
    }
    return {};
  };

  const getIR: PtDesignSession["getIR"] = (options) => {
    const full = encodeDesignIR(scene);
    if (options?.frameId) {
      const frame = resolveFrame(options.frameId);
      if (!frame) {
        throw new PtDesignError(PT_ERROR_CODES.NOT_FOUND, `Frame not found: ${options.frameId}`);
      }
      return {
        ...full,
        frames: full.frames.filter((f) => f.id === frame.id || f.name === options.frameId),
        freeNodes: [],
      };
    }
    if (options?.instanceIds?.length) {
      const allow = new Set(options.instanceIds);
      return {
        ...full,
        frames: full.frames
          .map((frame) => ({
            ...frame,
            nodes: frame.nodes.filter((n) => allow.has(n.instanceId)),
          }))
          .filter((frame) => frame.nodes.length > 0),
        freeNodes: full.freeNodes.filter((n) => allow.has(n.instanceId)),
      };
    }
    return full;
  };

  return {
    dispatch,
    getScene: () => scene,
    getIR,
    listCatalog: () =>
      listComponentTypes().map((e) => ({
        componentType: e.componentType,
        variants: e.variants,
      })),
    getSelection: () => selection.slice(),
    setSelection: (ids) => {
      selection = ids.slice();
    },
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    buildHandoff: (input) => {
      let ir: DesignIR;
      if (input.scope === "document") ir = getIR();
      else if (input.scope === "frame") ir = getIR({ frameId: input.frameId });
      else ir = getIR({ instanceIds: input.instanceIds ?? selection });
      return buildHandoffPayload({
        ir,
        prompt: input.prompt,
        includeImage: input.includeImage,
        clientId: input.clientId,
        invokeUrl: input.invokeUrl,
        collab: input.collab,
      });
    },
    resolveFrame,
  };
}

void createId;
