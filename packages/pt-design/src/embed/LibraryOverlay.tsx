"use client";

import React from "react";
import { chromeTokens } from "./chrome";

export function defaultDesignName(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `design-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

export function LibraryOverlay({
  theme,
  error,
  defaultName,
  onSave,
  onClose,
}: {
  theme: "light" | "dark";
  error?: string | null;
  defaultName: string;
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  const chrome = chromeTokens(theme);
  const [name, setName] = React.useState(defaultName);

  return (
    <div
      data-testid="pt-design-library"
      role="dialog"
      aria-label="Save"
      onMouseDown={(event) => event.stopPropagation()}
      style={{
        position: "absolute",
        top: 56,
        left: 12,
        zIndex: 22,
        width: 320,
        padding: 16,
        borderRadius: 12,
        background: chrome.card,
        color: chrome.fg,
        border: `1px solid ${chrome.border}`,
        boxShadow: "0 16px 40px rgba(0,0,0,0.28)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Save</div>
        <button
          type="button"
          onClick={onClose}
          style={{
            border: "none",
            background: "transparent",
            color: chrome.mutedFg,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Close
        </button>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave(name.trim() || defaultName);
        }}
        style={{ display: "flex", gap: 8 }}
      >
        <input
          data-testid="pt-design-library-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          style={{
            flex: 1,
            height: 36,
            borderRadius: 8,
            border: `1px solid ${chrome.border}`,
            background: chrome.bg,
            color: chrome.fg,
            padding: "0 10px",
            fontSize: 13,
          }}
        />
        <button
          type="submit"
          data-testid="pt-design-library-save"
          style={{
            height: 36,
            padding: "0 12px",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 500,
            background: theme === "dark" ? "var(--primary, #fafafa)" : "var(--primary, #18181b)",
            color: theme === "dark" ? "var(--primary-foreground, #09090b)" : "var(--primary-foreground, #fafafa)",
          }}
        >
          Save
        </button>
      </form>

      <div style={{ fontSize: 12, color: chrome.mutedFg }}>
        Saves to ~/.atmos/data/pt-design
      </div>

      {error ? (
        <div data-testid="pt-design-library-error" style={{ fontSize: 12, color: "var(--destructive, #ef4444)" }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
