"use client";

import React from "react";
import "./agent-pulse.css";

const PULSE_CSS = `
@keyframes pt-agent-pulse {
  0% { opacity: 0; transform: scale(0.995); }
  12% { opacity: 1; transform: scale(1); }
  45% { opacity: 0.35; transform: scale(1.004); }
  70% { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(1.008); }
}
.pt-agent-pulse-ring {
  position: absolute;
  pointer-events: none;
  border: 1.5px solid rgba(52, 211, 153, 0.9);
  box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.18), 0 0 14px 2px rgba(52, 211, 153, 0.3);
  border-radius: 10px;
  animation: pt-agent-pulse 2400ms ease-in-out forwards;
}
.pt-agent-pulse-label {
  position: absolute;
  pointer-events: none;
  transform: translateY(calc(-100% - 6px));
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.01em;
  color: #052e1c;
  background: rgba(167, 243, 208, 0.95);
  white-space: nowrap;
}
`;

export type PulseBox = { left: number; top: number; width: number; height: number };

export function AgentPulse({
  boxes,
  label,
}: {
  boxes: PulseBox[];
  label: string;
}) {
  React.useEffect(() => {
    const id = "pt-design-agent-pulse-style";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = PULSE_CSS;
    document.head.appendChild(style);
  }, []);
  if (boxes.length === 0) return null;
  return (
    <div data-testid="pt-design-agent-pulse" aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 4 }}>
      {boxes.map((box, index) => (
        <div
          key={`${label}:${box.left}:${box.top}:${index}`}
          className="pt-agent-pulse-ring"
          style={{
            left: box.left - 4,
            top: box.top - 4,
            width: Math.max(8, box.width + 8),
            height: Math.max(8, box.height + 8),
          }}
        >
          {index === 0 && label ? <span className="pt-agent-pulse-label">{label}</span> : null}
        </div>
      ))}
    </div>
  );
}
