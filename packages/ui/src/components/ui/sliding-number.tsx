"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  MotionValue,
  motion,
  useSpring,
  useTransform,
  motionValue,
} from "motion/react";
import useMeasure from "react-use-measure";
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
  const initial = motionValue(valueRoundedToPlace);
  const animatedValue = useSpring(initial, TRANSITION);

  useEffect(() => {
    animatedValue.set(valueRoundedToPlace);
  }, [animatedValue, valueRoundedToPlace]);

  return (
    // Clip the rolling strip so glyphs never paint outside the digit cell
    // (and never “follow” a moving tooltip shell via layout animations).
    <div
      className={cn(
        "relative inline-block w-[1ch] overflow-hidden leading-none tabular-nums",
        hidden && "pointer-events-none w-0 overflow-hidden opacity-0",
      )}
      aria-hidden={hidden || undefined}
    >
      <div className="invisible">0</div>
      {Array.from({ length: 10 }, (_, i) => (
        <DigitGlyph key={i} mv={animatedValue} digit={i} />
      ))}
    </div>
  );
}

function DigitGlyph({
  mv,
  digit,
}: {
  mv: MotionValue<number>;
  digit: number;
}) {
  const [ref, bounds] = useMeasure();

  const y = useTransform(mv, (latest) => {
    if (!bounds.height) return 0;
    const placeValue = latest % 10;
    const offset = (10 + digit - placeValue) % 10;
    let memo = offset * bounds.height;

    if (offset > 5) {
      memo -= 10 * bounds.height;
    }

    return memo;
  });

  // don't render the animated number until we know the height
  if (!bounds.height) {
    return (
      <span ref={ref} className="invisible absolute">
        {digit}
      </span>
    );
  }

  // No layoutId — layoutId re-animates position when a parent (e.g. hover
  // tooltip) moves with the pointer, which pulls digits out of the bubble.
  return (
    <motion.span
      style={{ y }}
      className="absolute inset-0 flex items-center justify-center"
      ref={ref}
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

  return (
    <div className={cn("inline-flex items-center", className)}>
      {safe < 0 && "-"}
      {integerPlaces.map((place) => (
        <Digit
          key={`pos-${place}`}
          value={integerValue}
          place={place}
          hidden={place >= 10 && integerValue < place}
        />
      ))}
      {decimalPart ? (
        <>
          <span>{decimalSeparator}</span>
          {decimalPart.split("").map((_, index) => (
            <Digit
              key={`decimal-${index}`}
              value={parseInt(decimalPart, 10)}
              place={Math.pow(10, decimalPart.length - index - 1)}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}
