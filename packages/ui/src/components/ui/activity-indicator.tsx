"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { TextShimmer } from "./text-shimmer";
import { Orb } from "./orb";
import { ThinkingStars } from "./thinking-stars";
import {
  isOrbIndicatorId,
  isUnicodeSpinnerId,
  pickActivityIndicatorStyle,
  type ActivityIndicatorGroup,
  type ActivityIndicatorStyle,
  type UnicodeSpinnerId,
} from "./activity-indicator-catalog";

export type {
  ActivityIndicatorStyle,
  UnicodeSpinnerId,
} from "./activity-indicator-catalog";
export {
  ACTIVITY_INDICATOR_GROUPS,
  ACTIVITY_INDICATOR_STYLES,
  ACTIVITY_STYLES_BY_GROUP,
  ActivityIndicatorGroup,
  isActivityIndicatorGroup,
  isActivityIndicatorStyle,
  isOrbIndicatorId,
  isUnicodeSpinnerId,
  ORB_VARIANT_IDS,
  pickActivityIndicatorStyle,
  stylesForGroups,
  UNICODE_SPINNER_IDS,
} from "./activity-indicator-catalog";

const DEFAULT_SIZE = 20;
const BRAILLE_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
const BRAILLE_INTERVAL = 80;
const BRAILLE: SpinnerData = { frames: BRAILLE_FRAMES, interval: BRAILLE_INTERVAL };

type SpinnerData = { frames: readonly string[]; interval: number };

export interface ActivityIndicatorProps {
  /**
   * Concrete style, or `"random"`.
   * Random with no `random` pool draws from every group.
   */
  style: ActivityIndicatorStyle | "random";
  /**
   * Random pool as groups (`ActivityIndicatorGroup.Lattice`, …).
   * Only used when `style` is `"random"`. Omit for all groups.
   */
  random?: readonly ActivityIndicatorGroup[];
  /** Glyph box edge in px. Default 20. */
  size?: number;
  /** Optional status copy next to the glyph. */
  label?: string;
  /** Traveling highlight on `label`. Defaults to on when a label is set. */
  shimmer?: boolean;
  /** Freeze motion (settings tiles). Default true. */
  animated?: boolean;
  /** Extra content after the label (elapsed timer, …). */
  trailing?: ReactNode;
  className?: string;
  title?: string;
}

export function ActivityIndicator({
  style,
  random,
  size = DEFAULT_SIZE,
  label,
  shimmer,
  animated = true,
  trailing,
  className,
  title,
}: ActivityIndicatorProps) {
  const poolKey = random?.join(",") ?? "";
  const resolved = useMemo(
    () =>
      style === "random"
        ? pickActivityIndicatorStyle(random)
        : style,
    // Pick once per mount / per pool identity so a streaming row keeps its orb.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [style, poolKey],
  );
  const showShimmer = shimmer ?? Boolean(label);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-muted-foreground",
        className,
      )}
      title={title}
    >
      <ActivityIndicatorGlyph
        style={resolved}
        size={size}
        animated={animated}
      />
      {label ? (
        showShimmer ? (
          <TextShimmer as="span" className="translate-y-px text-sm" duration={1.5}>
            {label}
          </TextShimmer>
        ) : (
          <span className="translate-y-px text-sm">{label}</span>
        )
      ) : null}
      {trailing}
    </span>
  );
}

function ActivityIndicatorGlyph({
  style,
  size,
  animated,
}: {
  style: ActivityIndicatorStyle;
  size: number;
  animated: boolean;
}) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-visible"
      style={{ width: size, height: size }}
    >
      {style === "stars" ? (
        <ThinkingStars size={size} animated={animated} />
      ) : isOrbIndicatorId(style) ? (
        <Orb
          variant={style}
          size={size}
          style={animated ? undefined : { animationPlayState: "paused" }}
        />
      ) : (
        <UnicodeGlyph
          id={isUnicodeSpinnerId(style) ? style : "braille"}
          size={size}
          animated={animated}
        />
      )}
    </span>
  );
}

function UnicodeGlyph({
  id,
  size,
  animated,
}: {
  id: UnicodeSpinnerId;
  size: number;
  animated: boolean;
}) {
  const frame = useUnicodeSpinner(id, animated);
  return (
    <span
      className="inline-flex size-full items-center justify-center font-mono leading-none"
      style={{ fontSize: Math.max(11, Math.round(size * 0.7)) }}
    >
      {frame}
    </span>
  );
}

function useUnicodeSpinner(id: UnicodeSpinnerId, animated: boolean): string {
  const [frame, setFrame] = useState(0);
  const [spinner, setSpinner] = useState<SpinnerData>(BRAILLE);

  useEffect(() => {
    if (id === "braille") {
      setSpinner(BRAILLE);
      setFrame(0);
      return;
    }

    let cancelled = false;
    import("unicode-animations").then((mod) => {
      if (cancelled) return;
      const spinners = (mod.default ?? mod) as Record<string, SpinnerData | undefined>;
      const next = spinners[id];
      setSpinner(next?.frames?.length ? next : BRAILLE);
      setFrame(0);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!spinner || !animated) return;
    const timer = setInterval(() => {
      setFrame((current) => current + 1);
    }, spinner.interval);
    return () => clearInterval(timer);
  }, [spinner, animated]);

  if (!animated) return spinner.frames[0] ?? BRAILLE_FRAMES[0];
  return spinner.frames[frame % spinner.frames.length] ?? BRAILLE_FRAMES[0];
}
