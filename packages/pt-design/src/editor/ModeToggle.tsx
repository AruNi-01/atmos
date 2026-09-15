import type { ReactElement } from "react";
import { MousePointerClick, Pencil } from "lucide-react";

export type DesignMode = "edit" | "interact";

export type ModeToggleProps = {
  mode: DesignMode;
  onModeChange: (mode: DesignMode) => void;
  labels?: { edit: string; interact: string };
};

export function ModeToggle({ mode, onModeChange, labels }: ModeToggleProps): ReactElement {
  const edit = labels?.edit ?? "Edit";
  const interact = labels?.interact ?? "Interact";
  return (
    <div
      data-testid="pt-design-mode"
      className="pt-design-mode-toggle"
      role="group"
      aria-label="Mode"
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="pt-design-mode-toggle__btn"
        aria-pressed={mode === "edit"}
        aria-label={edit}
        title={edit}
        onClick={() => onModeChange("edit")}
      >
        <Pencil size={16} strokeWidth={2} aria-hidden />
      </button>
      <button
        type="button"
        className="pt-design-mode-toggle__btn"
        aria-pressed={mode === "interact"}
        aria-label={interact}
        title={interact}
        onClick={() => onModeChange("interact")}
      >
        <MousePointerClick size={16} strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}
