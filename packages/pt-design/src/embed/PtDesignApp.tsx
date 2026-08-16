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
import {
  excalidrawElementsToScene,
  sceneFingerprint,
  sceneToExcalidrawElements,
  type ExcalidrawCompatElement,
  type ExcalidrawHostApi,
} from "./scene-bridge";

export type PtDesignAppProps = {
  session?: PtDesignSession;
  persistence?: PersistenceAdapter;
  handoff?: HandoffSink;
  theme?: PtTheme;
  className?: string;
  storageKey?: string;
};

const ExcalidrawBoard = React.lazy(() => import("./ExcalidrawBoard"));

function resolvedTheme(theme: PtTheme | undefined): "light" | "dark" {
  if (theme === "dark") return "dark";
  if (theme === "light") return "light";
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

export function PtDesignApp({
  session: external,
  persistence,
  handoff,
  theme,
  className,
  storageKey = "pt-design:scene:v1",
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
  const applyingRef = React.useRef(false);

  const pushScene = React.useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const scene = session.getScene();
    const current = excalidrawElementsToScene(
      api.getSceneElementsIncludingDeleted(),
      api.getAppState(),
    );
    if (sceneFingerprint(current) === sceneFingerprint(scene)) return;
    applyingRef.current = true;
    api.updateScene({ elements: sceneToExcalidrawElements(scene) });
    applyingRef.current = false;
  }, [session]);

  React.useEffect(() => {
    let cancelled = false;
    void persist.load().then((loaded) => {
      if (cancelled || !loaded) return;
      applyingRef.current = true;
      session.dispatch({ type: "replaceScene", scene: loaded.scene });
      applyingRef.current = false;
      setTick((n) => n + 1);
      pushScene();
    });
    return () => {
      cancelled = true;
    };
  }, [persist, session, pushScene]);

  React.useEffect(() => {
    return session.subscribe(() => {
      setTick((n) => n + 1);
      void persist.save({ scene: session.getScene() });
      if (!applyingRef.current) pushScene();
    });
  }, [persist, session, pushScene]);

  const scene = session.getScene();
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

    if (applyingRef.current) return;
    const next = excalidrawElementsToScene(elements, appState);
    if (sceneFingerprint(next) === sceneFingerprint(session.getScene())) return;
    applyingRef.current = true;
    session.dispatch({ type: "replaceScene", scene: next });
    applyingRef.current = false;
  };

  return (
    <div className={className} style={{ display: "flex", height: "100%", minHeight: 360, background: "#fafafa" }}>
      <aside
        style={{
          width: 220,
          borderRight: "1px solid #e4e4e7",
          overflow: "auto",
          padding: 8,
          background: "#fff",
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>PT Design</div>
        {catalog.map((item) => (
          <button
            key={item.componentType}
            type="button"
            onClick={() => {
              setCatalogType(item.componentType);
              session.dispatch({
                type: "place",
                componentType: item.componentType,
                at: placeAt(),
              });
            }}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              fontSize: 12,
              padding: "4px 6px",
              marginBottom: 2,
              border: "none",
              background: catalogType === item.componentType ? "#f4f4f5" : "transparent",
              cursor: "pointer",
            }}
          >
            {item.componentType}
          </button>
        ))}
      </aside>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: 8, borderBottom: "1px solid #e4e4e7" }}>
          <button
            type="button"
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
            onClick={() => {
              void navigator.clipboard?.writeText(JSON.stringify(session.getIR(), null, 2));
            }}
          >
            Copy IR
          </button>
          {selectedEntry && selectedInstanceId && selectedEntry.variants.length > 1 ? (
            <span style={{ display: "inline-flex", gap: 4, alignItems: "center", fontSize: 12 }}>
              Variant
              {selectedEntry.variants.map((variant) => (
                <button
                  key={variant}
                  type="button"
                  onClick={() => {
                    session.dispatch({ type: "update", instanceId: selectedInstanceId, variant });
                  }}
                  style={{
                    fontWeight: selected?.customData?.pt?.variant === variant ? 600 : 400,
                  }}
                >
                  {variant}
                </button>
              ))}
            </span>
          ) : null}
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <React.Suspense fallback={<div style={{ padding: 16, fontSize: 13 }}>Loading board…</div>}>
            <ExcalidrawBoard
              initialElements={sceneToExcalidrawElements(scene)}
              viewBackgroundColor={scene.appState.viewBackgroundColor}
              theme={resolvedTheme(theme)}
              onApi={(api) => {
                apiRef.current = api;
                pushScene();
              }}
              onChange={handleBoardChange}
            />
          </React.Suspense>
        </div>
      </div>
    </div>
  );
}
