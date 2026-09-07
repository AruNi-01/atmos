import type { ReactNode } from "react";
import type { Gesture } from "../../shared/control-contracts";
import { AndroidBackIcon, AndroidHomeIcon, AndroidRecentsIcon } from "./chrome-icons";

export type HardwareKey = Extract<
  Gesture,
  { type: "back" | "home" | "recents" | "power" }
>["type"];

type Props = {
  onPress: (key: HardwareKey) => void;
};

const BUTTONS: { key: Exclude<HardwareKey, "power">; label: string; icon: ReactNode }[] = [
  { key: "back", label: "Back", icon: <AndroidBackIcon /> },
  { key: "home", label: "Home", icon: <AndroidHomeIcon /> },
  { key: "recents", label: "Recents", icon: <AndroidRecentsIcon /> },
];

export function ControlBar({ onPress }: Props) {
  return (
    <footer className="chrome-nav">
      {BUTTONS.map((button) => (
        <button
          key={button.key}
          type="button"
          className="chrome-icon-btn"
          onClick={() => onPress(button.key)}
          aria-label={button.label}
          title={button.label}
        >
          {button.icon}
        </button>
      ))}
    </footer>
  );
}
