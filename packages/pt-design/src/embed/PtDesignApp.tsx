"use client";

import React from "react";
import { createPtDesignSession, type PtDesignSession } from "../core/session";
import { listComponentTypes } from "../catalog/registry";
import type { PtElement } from "../core/types";
import {
  localStoragePersistence,
  type HandoffSink,
  type PersistenceAdapter,
  type PtTheme,
} from "../host/adapters";

export type PtDesignAppProps = {
  session?: PtDesignSession;
  persistence?: PersistenceAdapter;
  handoff?: HandoffSink;
  theme?: PtTheme;
  className?: string;
  storageKey?: string;
};

function elementSvg(el: PtElement): React.ReactNode {
  const common = {
    stroke: el.strokeColor,
    fill: el.backgroundColor === "transparent" ? "none" : el.backgroundColor,
    strokeWidth: el.strokeWidth,
  };
  if (el.type === "ellipse") {
    return (
      <ellipse
        key={el.id}
        cx={el.x + el.width / 2}
        cy={el.y + el.height / 2}
        rx={el.width / 2}
        ry={el.height / 2}
        {...common}
      />
    );
  }
  if (el.type === "text") {
    return (
      <text
        key={el.id}
        x={el.textAlign === "center" ? el.x + el.width / 2 : el.x}
        y={el.y + el.height / 2}
        textAnchor={el.textAlign === "center" ? "middle" : "start"}
        dominantBaseline="middle"
        fontSize={el.fontSize ?? 13}
        fill={el.strokeColor}
      >
        {el.text}
      </text>
    );
  }
  return (
    <rect
      key={el.id}
      x={el.x}
      y={el.y}
      width={Math.max(el.width, 1)}
      height={Math.max(el.height, 1)}
      rx={el.roundness ? 6 : 0}
      {...common}
    />
  );
}

export function PtDesignApp({
  session: external,
  persistence,
  handoff,
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

  React.useEffect(() => {
    let cancelled = false;
    void persist.load().then((loaded) => {
      if (cancelled || !loaded) return;
      session.dispatch({ type: "replaceScene", scene: loaded.scene });
      setTick((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [persist, session]);

  React.useEffect(() => {
    return session.subscribe(() => {
      setTick((n) => n + 1);
      void persist.save({ scene: session.getScene() });
    });
  }, [persist, session]);

  const scene = session.getScene();
  const catalog = listComponentTypes();

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
                at: { x: 40 + Math.random() * 40, y: 40 + Math.random() * 40 },
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
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", gap: 8, padding: 8, borderBottom: "1px solid #e4e4e7" }}>
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
              const ir = session.getIR();
              void navigator.clipboard?.writeText(JSON.stringify(ir, null, 2));
            }}
          >
            Copy IR
          </button>
        </div>
        <svg
          data-testid="pt-design-board"
          viewBox="0 0 1200 800"
          style={{ flex: 1, background: "#fff" }}
        >
          {scene.elements.filter((el) => !el.isDeleted).map(elementSvg)}
        </svg>
      </div>
    </div>
  );
}
