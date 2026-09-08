"use client";

import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { ComposerFlyingMessage } from "@/features/agent/lib/composer-flying-message";
import "./composer-flying-message.css";

export function ComposerFlyingMessagePortal({
  message,
  onDone,
}: {
  message: ComposerFlyingMessage | null;
  onDone: () => void;
}) {
  if (!message || typeof document === "undefined") return null;

  return createPortal(
    <div
      key={message.id}
      aria-hidden="true"
      className="agent-composer-flying-message"
      style={{
        "--agent-composer-fly-from-x": `${message.from.x}px`,
        "--agent-composer-fly-from-y": `${message.from.y}px`,
        "--agent-composer-fly-to-x": `${message.to.x}px`,
        "--agent-composer-fly-to-y": `${message.to.y}px`,
      } as CSSProperties}
      onAnimationEnd={onDone}
    >
      {message.text}
    </div>,
    document.body,
  );
}
