"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  MotionValue,
  motion,
  useSpring,
  useTransform,
} from "motion/react";
import { cn } from "../../lib/utils";

const TRANSITION = {
  type: "spring" as const,
  stiffness: 280,
  damping: 18,
  mass: 0.3,
};

/** Hold extra high places briefly so 3→2 digit shrinks still morph tens/ones. */
const PLACE_SHRINK_MS = 420;

function Digit({
  value,
  place,
  hidden,
}: {
  value: number;
  place: number;
  /** Leading placeholder place (value < place) — keep mounted, hide visually. */
  hidden?: boolean;
}) {
  const valueRoundedToPlace = Math.floor(value / place) % 10;
  // Spring owns a stable MotionValue; we push targets via .set() so re-renders
  // always morph instead of rebinding to an already-final number.
  const animatedValue = useSpring(valueRoundedToPlace, TRANSITION);
  const sizerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    animatedValue.set(valueRoundedToPlace);
  }, [animatedValue, valueRoundedToPlace]);

  useLayoutEffect(() => {
    const el = sizerRef.current;
    if (!el) return;
    const measure = () => {
      const next = el.offsetHeight;
      if (next > 0) {
        setHeight((prev) => (prev === next ? prev : next));
      }
    };
    measure();
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(measure)
        : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  return (
    // Clip the rolling strip so glyphs never paint outside the digit cell.
    // h-[1em] + leading-none keeps the cap-height tight so tokens (no `$`)
    // don't show a tall empty band above the ink.
    <div
      className={cn(
        "relative inline-block h-[1em] w-[1ch] overflow-hidden leading-none tabular-nums",
        hidden && "pointer-events-none w-0 overflow-hidden opacity-0",
      )}
      aria-hidden={hidden || undefined}
    >
      <div ref={sizerRef} className="invisible block h-[1em] leading-none">
        0
      </div>
      {height > 0
        ? Array.from({ length: 10 }, (_, i) => (
            <DigitGlyph key={i} mv={animatedValue} digit={i} height={height} />
          ))
        : null}
    </div>
  );
}

function DigitGlyph({
  mv,
  digit,
  height,
}: {
  mv: MotionValue<number>;
  digit: number;
  height: number;
}) {
  const y = useTransform(mv, (latest) => {
    if (!height) return 0;
    const placeValue = latest % 10;
    const offset = (10 + digit - placeValue) % 10;
    let memo = offset * height;
    if (offset > 5) {
      memo -= 10 * height;
    }
    return memo;
  });

  // No layoutId — layoutId re-animates position when a parent (e.g. hover
  // tooltip) moves with the pointer, which pulls digits out of the bubble.
  return (
    <motion.span
      style={{ y }}
      className="absolute inset-0 flex items-center justify-center"
    >
      {digit}
    </motion.span>
  );
}

export type SlidingNumberProps = {
  value: number;
  padStart?: boolean;
  decimalSeparator?: string;
  /**
   * Force a fixed number of decimal digits (uses toFixed).
   * When omitted, decimals follow Number#toString.
   */
  decimals?: number;
  className?: string;
};

export function SlidingNumber({
  value,
  padStart = false,
  decimalSeparator = ".",
  decimals,
  className,
}: SlidingNumberProps) {
  const safe = Number.isFinite(value) ? value : 0;
  const absValue = Math.abs(safe);
  const rendered =
    decimals != null && decimals >= 0
      ? absValue.toFixed(decimals)
      : String(absValue);
  const [integerPart, decimalPart] = rendered.split(".");
  const integerValue = parseInt(integerPart || "0", 10);
  const neededPlaces = Math.max(1, (integerPart || "0").length);
  // Keep high places mounted briefly when digit count shrinks so existing
  // Digit springs morph instead of remounting to the final glyph.
  const [heldPlaces, setHeldPlaces] = useState(neededPlaces);
  const shrinkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    if (neededPlaces >= heldPlaces) {
      if (shrinkTimer.current) {
        clearTimeout(shrinkTimer.current);
        shrinkTimer.current = null;
      }
      setHeldPlaces(neededPlaces);
      return;
    }
    if (shrinkTimer.current) clearTimeout(shrinkTimer.current);
    shrinkTimer.current = setTimeout(() => {
      setHeldPlaces(neededPlaces);
      shrinkTimer.current = null;
    }, PLACE_SHRINK_MS);
    return () => {
      if (shrinkTimer.current) clearTimeout(shrinkTimer.current);
    };
  }, [neededPlaces, heldPlaces]);

  const placeCount =
    padStart && integerValue < 10
      ? Math.max(2, heldPlaces)
      : Math.max(neededPlaces, heldPlaces);
  const integerPlaces = Array.from({ length: placeCount }, (_, i) =>
    Math.pow(10, placeCount - i - 1),
  );

  // Keep a fixed decimal slot count while decimals are present so switching
  // metric (e.g. 1 → 2 places) does not remount all decimal Digit springs.
  const decimalLen = decimalPart?.length ?? 0;
  const [heldDecimals, setHeldDecimals] = useState(decimalLen);
  useLayoutEffect(() => {
    if (decimalLen >= heldDecimals) {
      setHeldDecimals(decimalLen);
      return;
    }
    if (decimalLen === 0) {
      // Dropping decimals entirely (tokens integer path) — clear after morph.
      const id = window.setTimeout(() => setHeldDecimals(0), PLACE_SHRINK_MS);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(
      () => setHeldDecimals(decimalLen),
      PLACE_SHRINK_MS,
    );
    return () => window.clearTimeout(id);
  }, [decimalLen, heldDecimals]);

  const decimalSlots = Math.max(decimalLen, heldDecimals);
  const decimalValue =
    decimalPart != null
      ? parseInt(decimalPart.padEnd(decimalSlots, "0"), 10)
      : 0;

  return (
    <div className={cn("inline-flex items-center leading-none", className)}>
      {safe < 0 && "-"}
      {integerPlaces.map((place) => (
        <Digit
          key={`pos-${place}`}
          value={integerValue}
          place={place}
          hidden={place >= 10 && integerValue < place}
        />
      ))}
      {decimalSlots > 0 ? (
        <>
          <span>{decimalSeparator}</span>
          {Array.from({ length: decimalSlots }, (_, index) => (
            <Digit
              key={`decimal-${index}`}
              value={decimalValue}
              place={Math.pow(10, decimalSlots - index - 1)}
              hidden={decimalLen === 0 || index >= decimalLen}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}
