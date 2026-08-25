"use client";

import { cn } from "../../lib/utils";
import {
  motion,
  stagger,
  useAnimate,
  useInView,
  useReducedMotion,
} from "motion/react";
import { useEffect, useId, useMemo, useState, type ElementType, type ReactNode } from "react";

const CHAR_SELECTOR = "[data-typewriter-char]";

export type TypewriterWord = {
  text: string;
  className?: string;
  /** Rendered instead of `text` characters (for example a wordmark). `text` is still used for accessibility. */
  node?: ReactNode;
};

export type TypewriterEffectProps = {
  words: TypewriterWord[];
  className?: string;
  cursorClassName?: string;
  as?: ElementType;
};

export type TypewriterEffectSmoothProps = TypewriterEffectProps & {
  /** Fade the caret out after type-in finishes. Default keeps blinking. */
  hideCursorWhenComplete?: boolean;
};

function splitWordChars(word: TypewriterWord): string[] {
  if (word.node) return [];
  return Array.from(word.text);
}

function accessibleLabel(words: TypewriterWord[]): string {
  return words
    .map((word) => word.text.trim())
    .filter(Boolean)
    .reduce((label, text) => {
      if (!label) return text;
      if (/^[?.!,;:，。？！、]/.test(text)) return `${label}${text}`;
      return `${label} ${text}`;
    }, "");
}

export function TypewriterEffect({
  words,
  className,
  cursorClassName,
  as: Component = "div",
}: TypewriterEffectProps) {
  const labelId = useId();
  const prefersReducedMotion = useReducedMotion();
  const wordsArray = useMemo(
    () =>
      words.map((word) => ({
        ...word,
        chars: splitWordChars(word),
      })),
    [words],
  );
  const label = useMemo(() => accessibleLabel(words), [words]);
  const wordsSignature = useMemo(
    () => words.map((word) => `${word.text}\0${word.node ? "1" : "0"}`).join("\n"),
    [words],
  );

  const [scope, animate] = useAnimate();
  const isInView = useInView(scope, { once: true, amount: 0.35 });

  useEffect(() => {
    if (!isInView || prefersReducedMotion) return;

    const controls = animate(
      CHAR_SELECTOR,
      {
        display: "inline-flex",
        opacity: 1,
        width: "fit-content",
      },
      {
        duration: 0.3,
        delay: stagger(0.1),
        ease: "easeInOut",
      },
    );

    return () => {
      controls.stop();
    };
  }, [animate, isInView, prefersReducedMotion, wordsSignature]);

  const hiddenCharClass = prefersReducedMotion
    ? "inline-flex"
    : "hidden opacity-0";

  return (
    <Component
      className={cn(
        "text-center text-base font-bold sm:text-xl md:text-3xl lg:text-5xl",
        className,
      )}
      aria-labelledby={labelId}
    >
      <span id={labelId} className="sr-only">
        {label}
      </span>
      <motion.span ref={scope} className="inline" aria-hidden="true">
        {wordsArray.map((word, wordIndex) => (
          <span key={`word-${wordIndex}`} className="inline-block whitespace-nowrap">
            {word.node ? (
              <motion.span
                data-typewriter-char=""
                initial={{}}
                className={cn(
                  hiddenCharClass,
                  "items-center align-middle text-foreground",
                  word.className,
                )}
              >
                {word.node}
              </motion.span>
            ) : (
              word.chars.map((char, charIndex) => (
                <motion.span
                  data-typewriter-char=""
                  initial={{}}
                  key={`char-${charIndex}`}
                  className={cn(
                    hiddenCharClass,
                    "items-center text-foreground",
                    word.className,
                  )}
                >
                  {char === " " ? "\u00A0" : char}
                </motion.span>
              ))
            )}
            {wordIndex < wordsArray.length - 1 ? "\u00A0" : null}
          </span>
        ))}
      </motion.span>
      <motion.span
        aria-hidden="true"
        initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={
          prefersReducedMotion
            ? { duration: 0 }
            : {
                duration: 0.8,
                repeat: Infinity,
                repeatType: "reverse",
              }
        }
        className={cn(
          "ml-[0.22em] inline-block h-4 w-[4px] rounded-sm bg-primary align-middle md:h-6 lg:h-10",
          cursorClassName,
        )}
      />
    </Component>
  );
}

export function TypewriterEffectSmooth({
  words,
  className,
  cursorClassName,
  hideCursorWhenComplete = false,
  as: Component = "div",
}: TypewriterEffectSmoothProps) {
  const labelId = useId();
  const prefersReducedMotion = useReducedMotion();
  const [typed, setTyped] = useState(false);
  const hideCursor = hideCursorWhenComplete && (Boolean(prefersReducedMotion) || typed);
  const wordsArray = useMemo(
    () =>
      words.map((word) => ({
        ...word,
        chars: splitWordChars(word),
      })),
    [words],
  );
  const label = useMemo(() => accessibleLabel(words), [words]);

  return (
    <Component
      className={cn(
        "my-6 flex items-end space-x-1 text-xs font-bold sm:text-base md:text-xl lg:text-3xl xl:text-5xl",
        className,
      )}
      aria-labelledby={labelId}
    >
      <span id={labelId} className="sr-only">
        {label}
      </span>
      <motion.div
        aria-hidden="true"
        className="overflow-hidden"
        initial={{ width: prefersReducedMotion ? "fit-content" : 0 }}
        animate={{ width: "fit-content" }}
        transition={
          prefersReducedMotion
            ? { duration: 0 }
            : {
                duration: 2,
                ease: "linear",
                delay: 1,
              }
        }
        onAnimationComplete={hideCursorWhenComplete ? () => setTyped(true) : undefined}
      >
        <div style={{ whiteSpace: "nowrap" }}>
          {wordsArray.map((word, wordIndex) => (
            <span key={`word-${wordIndex}`} className="inline-block align-baseline">
              {word.node ? (
                <span className={cn("inline-flex items-end align-baseline text-foreground", word.className)}>
                  {word.node}
                </span>
              ) : (
                word.chars.map((char, charIndex) => (
                  <span
                    key={`char-${charIndex}`}
                    className={cn("text-foreground", word.className)}
                  >
                    {char}
                  </span>
                ))
              )}
              &nbsp;
            </span>
          ))}
        </div>
      </motion.div>
      <motion.span
        aria-hidden="true"
        initial={{ opacity: prefersReducedMotion && !hideCursorWhenComplete ? 1 : 0 }}
        animate={{ opacity: hideCursor ? 0 : 1 }}
        transition={
          hideCursor
            ? { duration: 0.28, ease: [0.22, 1, 0.36, 1] }
            : prefersReducedMotion
              ? { duration: 0 }
              : {
                  duration: 0.8,
                  repeat: Infinity,
                  repeatType: "reverse",
                }
        }
        className={cn(
          "block h-4 w-[4px] rounded-sm bg-primary sm:h-6 xl:h-12",
          cursorClassName,
        )}
      />
    </Component>
  );
}
