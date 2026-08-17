"use client";

import React from "react";
import { createPtDesignSession, type PtDesignSession } from "../core/session";
import { listComponentTypes } from "../catalog/registry";
import {
  localStoragePersistence,
  type HandoffSink,
  type PersistenceAdapter,
  type PtTheme,
} from "../host/adapters";
import { FONT_HELVETICA } from "../catalog/primitives";
import { chromeTokens, resolveBoardTheme } from "./chrome";
import { ComponentCatalog } from "./ComponentCatalog";
import { createApplyGate } from "./apply-gate";
import { createPersistDebouncer } from "./persist-debounce";
import {
  excalidrawElementsToScene,
  sceneFingerprint,
  sceneToExcalidrawElements,
  type ExcalidrawCompatElement,
  type ExcalidrawHostApi,
} from "./scene-bridge";
import { AgentPulse } from "./AgentPulse";
import { useLiveEvents } from "./use-live-events";
import { boxesForTouched, sceneBoxToViewport, type SceneBox } from "../live/touched";
import type { LiveEvent } from "../live/protocol";

export type PtDesignAppProps = {
  session?: PtDesignSession;
  persistence?: PersistenceAdapter;
  handoff?: HandoffSink;
  theme?: PtTheme;
  className?: string;
  storageKey?: string;
  /** Empty string disables the local agent live channel. */
  liveUrl?: string;
};

const ExcalidrawBoard = React.lazy(() => import("./ExcalidrawBoard"));

export function PtDesignApp({
  session: external,
  persistence,
  handoff,
  theme,
  className,
  storageKey = "pt-design:scene:v1",
  liveUrl,
}: PtDesignAppProps) {
  const persist = React.useMemo(
    () => persistence ?? localStoragePersistence(storageKey),
    [persistence, storageKey],
  );
  const [session] = React.useState(() => external ?? createPtDesignSession());
  const [, setTick] = React.useState(0);
  const [catalogType, setCatalogType] = React.useState("button");
  const [selectedInstanceId, setSelectedInstanceId] = React.useState<string | null>(null);
  const apiRef = React.useRef<ExcalidrawHostApi | null>(null);
  const applyGateRef = React.useRef(createApplyGate());
  const loadingRef = React.useRef(false);
  const [pulse, setPulse] = React.useState<{ label: string; boxes: SceneBox[] } | null>(null);
  const [activity, setActivity] = React.useState<string | null>(null);
  const [, setCameraTick] = React.useState(0);
  const pulseTimer = React.useRef<number>(0);
  const boardTheme = resolveBoardTheme(theme);
  const chrome = chromeTokens(boardTheme);

  const beginApply = React.useCallback(() => {
    applyGateRef.current.begin();
  }, []);

  const pushScene = React.useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const scene = session.getScene();
    const current = excalidrawElementsToScene(
      api.getSceneElementsIncludingDeleted(),
      api.getAppState(),
      boardTheme,
    );
    if (sceneFingerprint(current) === sceneFingerprint(scene)) return;
    beginApply();
    api.updateScene({ elements: sceneToExcalidrawElements(scene, boardTheme) });
  }, [session, boardTheme, beginApply]);

  React.useEffect(() => {
    let cancelled = false;
    void persist.load().then((loaded) => {
      if (cancelled || !loaded) return;
      loadingRef.current = true;
      session.dispatch({ type: "replaceScene", scene: loaded.scene });
      loadingRef.current = false;
      setTick((n) => n + 1);
      pushScene();
    });
    return () => {
      cancelled = true;
    };
  }, [persist, session, pushScene, beginApply]);

  React.useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    beginApply();
    api.updateScene({
      elements: sceneToExcalidrawElements(session.getScene(), boardTheme),
      appState: {
        theme: boardTheme,
        viewBackgroundColor: chrome.canvas,
        currentItemRoughness: 1,
        currentItemFontFamily: FONT_HELVETICA,
      },
    });
  }, [boardTheme, chrome.canvas, session, beginApply]);

  React.useEffect(() => {
    const debouncer = createPersistDebouncer((scene) => persist.save({ scene }));
    const unsubscribe = session.subscribe(() => {
      setTick((n) => n + 1);
      if (!loadingRef.current) debouncer.schedule(session.getScene());
      if (!loadingRef.current && !applyGateRef.current.isPending()) pushScene();
    });
    return () => {
      unsubscribe();
      debouncer.flush();
    };
  }, [persist, session, pushScene]);

  const applyLiveEvent = React.useCallback(
    (event: LiveEvent) => {
      if (event.scene) {
        loadingRef.current = true;
        session.dispatch({ type: "replaceScene", scene: event.scene });
        loadingRef.current = false;
        setTick((n) => n + 1);
      }
      const scene = event.scene ?? session.getScene();
      const boxes =
        event.boxes.length > 0
          ? event.boxes
          : boxesForTouched(scene, { instanceIds: event.instanceIds, elementIds: event.elementIds });
      const label = `Agent · ${event.label}`;
      setActivity(label);
      setPulse(boxes.length ? { label, boxes } : null);
      window.clearTimeout(pulseTimer.current);
      pulseTimer.current = window.setTimeout(() => {
        setPulse((current) => (current?.label === label ? null : current));
        setActivity((current) => (current === label ? null : current));
      }, 2400);
      pushScene();
      const api = apiRef.current;
      if (api && boxes.length) {
        const cam = api.getAppState();
        const vp = sceneBoxToViewport(boxes[0]!, cam);
        const margin = 48;
        const visible =
          vp.left >= margin &&
          vp.top >= margin &&
          vp.left + vp.width <= cam.width - margin &&
          vp.top + vp.height <= cam.height - margin;
        if (!visible) {
          const targets = scene.elements.filter((el) => {
            if (el.isDeleted) return false;
            if (event.elementIds.includes(el.id)) return true;
            const instanceId = el.customData?.pt?.instanceId;
            return Boolean(instanceId && event.instanceIds.includes(instanceId));
          });
          try {
            api.scrollToContent(targets.length ? targets : undefined, { animate: true });
          } catch {
            /* Excalidraw may reject a transient scene */
          }
        }
        setCameraTick((n) => n + 1);
      }
    },
    [pushScene, session],
  );

  React.useEffect(() => {
    return () => window.clearTimeout(pulseTimer.current);
  }, []);

  useLiveEvents(liveUrl, applyLiveEvent);

  const scene = session.getScene();
  const camera = apiRef.current?.getAppState();
  const pulseBoxes = pulse
    ? pulse.boxes.map((box) =>
        sceneBoxToViewport(box, camera ?? { scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
      )
    : [];
  const catalog = listComponentTypes();
  const selected = selectedInstanceId
    ? scene.elements.find(
        (el) => el.customData?.pt?.instanceId === selectedInstanceId && el.customData.pt.componentType,
      )
    : undefined;
  const selectedType = selected?.customData?.pt?.componentType;
  const selectedEntry = catalog.find((item) => item.componentType === selectedType);

  const placeAt = () => {
    const count = scene.elements.filter((el) => el.customData?.pt?.componentType).length;
    return { x: 80 + (count % 6) * 24, y: 80 + Math.floor(count / 6) * 24 };
  };

  const handleBoardChange = (
    elements: readonly ExcalidrawCompatElement[],
    appState: { viewBackgroundColor: string; selectedElementIds: Record<string, boolean> },
  ) => {
    const selectedIds = Object.keys(appState.selectedElementIds ?? {}).filter(
      (id) => appState.selectedElementIds[id],
    );
    const instanceId = elements.find((el) => selectedIds.includes(el.id) && el.customData?.pt?.instanceId)
      ?.customData?.pt?.instanceId;
    setSelectedInstanceId(instanceId ?? null);
    if (instanceId) session.setSelection([instanceId]);
    setCameraTick((n) => n + 1);

    if (applyGateRef.current.consume()) return;
    const next = excalidrawElementsToScene(elements, appState, boardTheme);
    if (sceneFingerprint(next) === sceneFingerprint(session.getScene())) return;
    session.dispatch({ type: "replaceScene", scene: next });
  };

  const toolButton: React.CSSProperties = {
    fontSize: 12,
    color: chrome.fg,
    background: chrome.muted,
    border: `1px solid ${chrome.border}`,
    borderRadius: 8,
    padding: "6px 10px",
    cursor: "pointer",
  };

  return (
    <div
      className={className}
      data-testid="pt-design-app"
      data-theme={boardTheme}
      style={{
        display: "flex",
        height: "100%",
        minHeight: 360,
        background: chrome.bg,
        color: chrome.fg,
      }}
    >
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: chrome.bg }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            padding: 8,
            borderBottom: `1px solid ${chrome.border}`,
            background: chrome.card,
            color: chrome.fg,
          }}
        >
          <button
            type="button"
            style={toolButton}
            onClick={() => {
              session.dispatch({
                type: "createFrame",
                name: "Frame",
                bbox: { x: 40, y: 40, w: 480, h: 320 },
              });
            }}
          >
            Add frame
          </button>
          <button
            type="button"
            style={toolButton}
            onClick={() => {
              const payload = session.buildHandoff({ scope: "document" });
              if (handoff) void handoff.accept(payload);
              else void navigator.clipboard?.writeText(JSON.stringify(payload, null, 2));
            }}
          >
            Give to Agent
          </button>
          <button
            type="button"
            style={toolButton}
            onClick={() => {
              void navigator.clipboard?.writeText(JSON.stringify(session.getIR(), null, 2));
            }}
          >
            Copy IR
          </button>
          {activity ? (
            <span data-testid="pt-design-agent-activity" style={{ fontSize: 12, color: chrome.mutedFg }}>
              {activity}
            </span>
          ) : null}
          {selectedEntry && selectedInstanceId && selectedEntry.variants.length > 1 ? (
            <span style={{ display: "inline-flex", gap: 4, alignItems: "center", fontSize: 12, color: chrome.mutedFg }}>
              Variant
              {selectedEntry.variants.map((variant) => (
                <button
                  key={variant}
                  type="button"
                  onClick={() => {
                    session.dispatch({ type: "update", instanceId: selectedInstanceId, variant });
                  }}
                  style={{
                    ...toolButton,
                    fontWeight: selected?.customData?.pt?.variant === variant ? 600 : 400,
                  }}
                >
                  {variant}
                </button>
              ))}
            </span>
          ) : null}
        </div>
        <div style={{ flex: 1, minHeight: 0, background: chrome.canvas }}>
          <React.Suspense fallback={<div style={{ padding: 16, fontSize: 13, color: chrome.mutedFg }}>Loading board…</div>}>
            <ExcalidrawBoard
              initialElements={sceneToExcalidrawElements(scene, boardTheme)}
              viewBackgroundColor={chrome.canvas}
              theme={boardTheme}
              onApi={(api) => {
                apiRef.current = api;
                pushScene();
              }}
              onChange={handleBoardChange}
              overlay={pulse ? <AgentPulse boxes={pulseBoxes} label={pulse.label} /> : null}
              catalog={
                <ComponentCatalog
                  items={catalog}
                  activeType={catalogType}
                  onPlace={(componentType, variant) => {
                    setCatalogType(componentType);
                    session.dispatch({
                      type: "place",
                      componentType,
                      variant,
                      at: placeAt(),
                    });
                  }}
                />
              }
            />
          </React.Suspense>
        </div>
      </div>
    </div>
  );
}
