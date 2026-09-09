"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { RangeSlider } from "@workspace/ui";
import { EASE_OUT, SPRING_LAYOUT } from "@workspace/ui/lib/ease";
import {
  toolCallDensityFromIndex,
  toolCallDensityIndex,
  toolCallDensityIndexFromRatio,
  TOOL_CALL_DENSITY_LEVELS,
} from "@/features/agent/lib/tool-call-density";
import { useAgentToolCallDensityStore } from "@/features/settings/store/agent-tool-call-density-store";
import { AgentToolCallDensityPreview } from "@/features/settings/components/AgentToolCallDensityPreview";
import {
  SettingsGroupCard,
  SettingsGroupRow,
} from "@/features/settings/components/settings/SettingsGroupCard";

const PREVIEW_WIDTH = 336;
const PREVIEW_GAP = 10;
const TICK_INSET = 12;

function previewAnchor(
  slider: DOMRect,
  bottom: number,
  index: number,
  viewportWidth: number,
): { x: number; y: number } {
  const max = TOOL_CALL_DENSITY_LEVELS.length - 1;
  const innerLeft = slider.left + TICK_INSET;
  const innerWidth = Math.max(1, slider.width - TICK_INSET * 2);
  const center = innerLeft + (index / max) * innerWidth;
  const half = PREVIEW_WIDTH / 2;
  const pad = 8;
  return {
    x: Math.min(Math.max(center, pad + half), Math.max(pad + half, viewportWidth - pad - half)),
    y: bottom + PREVIEW_GAP,
  };
}

export function AgentToolCallDensitySettingsSection() {
  const t = useTranslations("settings.codeAgentSection.toolCallDensity");
  const density = useAgentToolCallDensityStore((state) => state.density);
  const setDensity = useAgentToolCallDensityStore((state) => state.setDensity);
  const loadSettings = useAgentToolCallDensityStore((state) => state.loadSettings);
  const reduce = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(() => toolCallDensityIndex(density));
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    setIndex(toolCallDensityIndex(density));
  }, [density]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useLayoutEffect(() => {
    if (hoverIndex == null) {
      setAnchor(null);
      return;
    }
    const update = () => {
      const slider = sliderRef.current?.getBoundingClientRect();
      const root = rootRef.current?.getBoundingClientRect();
      if (!slider || !root) return;
      setAnchor(previewAnchor(slider, root.bottom, hoverIndex, window.innerWidth));
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [hoverIndex]);

  const previewDensity = hoverIndex == null
    ? null
    : toolCallDensityFromIndex(hoverIndex);
  const transition = reduce ? { duration: 0 } : SPRING_LAYOUT;

  return (
    <SettingsGroupCard title={t("groupTitle")} description={t("groupDescription")}>
      <SettingsGroupRow wide title={t("title")} description={t("description")}>
        <div
          ref={rootRef}
          className="relative w-[11.5rem]"
          onPointerMove={(event) => {
            if (event.pointerType === "touch") return;
            const rect = event.currentTarget.getBoundingClientRect();
            if (rect.width <= 0) return;
            setHoverIndex(
              toolCallDensityIndexFromRatio((event.clientX - rect.left) / rect.width),
            );
          }}
          onPointerLeave={() => setHoverIndex(null)}
        >
          <div ref={sliderRef}>
            <RangeSlider
              variant="effort"
              min={0}
              max={TOOL_CALL_DENSITY_LEVELS.length - 1}
              step={1}
              value={index}
              aria-label={t("title")}
              formatValueText={(next) => {
                if (next <= 0) return t("compact");
                if (next >= 2) return t("detailed");
                return t("standard");
              }}
              onValueChange={setIndex}
              onValueCommit={(next) => {
                void setDensity(toolCallDensityFromIndex(next));
              }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[11px] leading-4 text-muted-foreground">
            <span>{t("compact")}</span>
            <span>{t("detailed")}</span>
          </div>
        </div>
        {portalReady
          ? createPortal(
            <AnimatePresence>
              {previewDensity && anchor ? (
                <motion.div
                  key="tool-call-density-preview"
                  className="pointer-events-none fixed z-[80] -translate-x-1/2"
                  initial={{ opacity: 0, y: 6, left: anchor.x, top: anchor.y }}
                  animate={{ opacity: 1, y: 0, left: anchor.x, top: anchor.y }}
                  exit={{ opacity: 0, y: 4, transition: { duration: reduce ? 0 : 0.12, ease: EASE_OUT } }}
                  transition={transition}
                  style={{ width: PREVIEW_WIDTH }}
                >
                  <motion.div
                    layout
                    transition={transition}
                    className="overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md"
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div
                        key={previewDensity}
                        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(6px)" }}
                        animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
                        exit={
                          reduce
                            ? { opacity: 0 }
                            : {
                                opacity: 0,
                                y: -2,
                                filter: "blur(4px)",
                                transition: { duration: 0.12, ease: EASE_OUT },
                              }
                        }
                        transition={{ duration: reduce ? 0 : 0.18, ease: EASE_OUT }}
                        className="p-3"
                      >
                        <AgentToolCallDensityPreview density={previewDensity} />
                      </motion.div>
                    </AnimatePresence>
                  </motion.div>
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
          : null}
      </SettingsGroupRow>
    </SettingsGroupCard>
  );
}
