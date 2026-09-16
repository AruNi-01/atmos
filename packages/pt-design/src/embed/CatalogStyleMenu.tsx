"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, SwatchBook } from "lucide-react";
import React from "react";
import {
  PT_RADIUS_GLOBAL_OPTIONS,
  type PtRadiusToken,
} from "../components/radius";

const EASE = [0.16, 1, 0.3, 1] as const;
const PRESS = { scale: 0.96 };

export function CatalogStyleMenu({
  radius,
  onRadiusChange,
}: {
  radius: PtRadiusToken;
  onRadiusChange: (radius: PtRadiusToken) => void;
}) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);
  const [section, setSection] = React.useState<"root" | "radius">("root");
  const reduceMotion = useReducedMotion();
  const current = PT_RADIUS_GLOBAL_OPTIONS.find((option) => option.id === radius);

  React.useEffect(() => {
    if (!open) {
      setSection("root");
      return;
    }
    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-testid='pt-design-catalog-style']")) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="pt-design-catalog-style"
      data-testid="pt-design-catalog-style"
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <motion.button
        type="button"
        className="pt-design-catalog-style__btn"
        title="Style"
        aria-label="Style"
        aria-expanded={open}
        aria-haspopup="menu"
        data-open={open ? "true" : "false"}
        whileTap={reduceMotion ? undefined : PRESS}
        transition={{ duration: reduceMotion ? 0 : 0.12, ease: EASE }}
        onClick={() => setOpen((prev) => !prev)}
      >
        <SwatchBook size={16} strokeWidth={2} />
      </motion.button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            className="pt-design-catalog-style-menu"
            role="menu"
            aria-label="Style"
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: reduceMotion ? 0 : 0.16, ease: EASE }}
          >
            {section === "root" ? (
              <button
                type="button"
                role="menuitem"
                className="pt-design-catalog-style-row"
                data-testid="pt-design-catalog-style-radius"
                onClick={() => setSection("radius")}
              >
                <span>Radius</span>
                <span className="pt-design-catalog-style-row__value">{current?.label ?? "Small"}</span>
              </button>
            ) : (
              PT_RADIUS_GLOBAL_OPTIONS.map((option) => {
                const selected = option.id === radius;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    className="pt-design-catalog-style-row"
                    data-selected={selected ? "true" : "false"}
                    data-testid={`pt-design-catalog-style-radius-${option.id}`}
                    onClick={() => {
                      onRadiusChange(option.id);
                      setOpen(false);
                    }}
                  >
                    <span>{option.label}</span>
                    {selected ? <Check size={14} strokeWidth={2.25} /> : null}
                  </button>
                );
              })
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
