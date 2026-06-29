"use client";

import React from "react";
import { createPortal } from "react-dom";

import type { TerminalAgentFlyingMessage } from "../lib/terminal-agent-input-overlay-utils";

export function TerminalAgentFlyingMessagePortal({
  message,
  onDone,
}: {
  message: TerminalAgentFlyingMessage | null;
  onDone: () => void;
}) {
  if (!message || typeof document === "undefined") return null;

  return createPortal(
    <div
      key={message.id}
      aria-hidden="true"
      className="terminal-agent-flying-message"
      style={{
        "--terminal-agent-fly-from-x": `${message.from.x}px`,
        "--terminal-agent-fly-from-y": `${message.from.y}px`,
        "--terminal-agent-fly-to-x": `${message.to.x}px`,
        "--terminal-agent-fly-to-y": `${message.to.y}px`,
      } as React.CSSProperties}
      onAnimationEnd={onDone}
    >
      {message.text}
    </div>,
    document.body,
  );
}
