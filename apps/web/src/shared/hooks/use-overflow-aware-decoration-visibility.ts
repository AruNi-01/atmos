"use client";

import { useLayoutEffect, useRef, useState } from "react";

interface OverflowAwareDecorationVisibilityOptions {
  measurementKey: string;
  measureWithinContainer?: boolean;
}

export function useOverflowAwareDecorationVisibility({
  measurementKey,
  measureWithinContainer = false,
}: OverflowAwareDecorationVisibilityOptions) {
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);
  const decorationRef = useRef<HTMLDivElement | null>(null);
  const measurementCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [shouldHideDecoration, setShouldHideDecoration] = useState(false);

  useLayoutEffect(() => {
    const textElement = textRef.current;
    const containerElement = measureWithinContainer
      ? containerRef.current
      : textElement;
    if (!containerElement || !textElement) return;

    const measureTextWidth = () => {
      const text = textElement.textContent ?? "";
      if (!text) return 0;

      const style = window.getComputedStyle(textElement);
      const canvas =
        measurementCanvasRef.current ?? document.createElement("canvas");
      measurementCanvasRef.current = canvas;
      const context = canvas.getContext("2d");
      if (!context) return textElement.scrollWidth;

      context.font =
        style.font ||
        `${style.fontStyle} ${style.fontVariant} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      return context.measureText(text).width;
    };

    let animationFrame: number | null = null;
    const measureNow = () => {
      animationFrame = null;
      const decorationElement = decorationRef.current;
      const previousDisplay = decorationElement?.style.display;
      const previousVisibility = decorationElement?.style.visibility;
      if (decorationElement) {
        decorationElement.style.display = "flex";
        decorationElement.style.visibility = "hidden";
      }

      const availableWidth = measureWithinContainer
        ? visibleTextWidthWithin(containerElement, textElement)
        : textElement.getBoundingClientRect().width;
      const next =
        textElement.scrollWidth > availableWidth + 1 ||
        measureTextWidth() > availableWidth + 1;

      if (decorationElement) {
        decorationElement.style.display = previousDisplay ?? "";
        decorationElement.style.visibility = previousVisibility ?? "";
      }

      setShouldHideDecoration((current) => (current === next ? current : next));
    };

    const measure = () => {
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
      }

      if (typeof requestAnimationFrame === "undefined") {
        measureNow();
        return;
      }

      animationFrame = requestAnimationFrame(measureNow);
    };

    measure();

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    resizeObserver?.observe(containerElement);
    if (textElement !== containerElement) {
      resizeObserver?.observe(textElement);
    }
    if (decorationRef.current) {
      resizeObserver?.observe(decorationRef.current);
    }

    if (typeof window !== "undefined") {
      window.addEventListener("resize", measure);
    }

    return () => {
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
      }
      resizeObserver?.disconnect();
      if (typeof window !== "undefined") {
        window.removeEventListener("resize", measure);
      }
    };
  }, [measurementKey, measureWithinContainer, shouldHideDecoration]);

  return {
    containerRef,
    decorationRef,
    shouldHideDecoration,
    textRef,
  };
}

function visibleTextWidthWithin(
  containerElement: HTMLElement,
  textElement: HTMLElement,
) {
  const containerRect = containerElement.getBoundingClientRect();
  const textRect = textElement.getBoundingClientRect();
  return Math.max(
    0,
    Math.min(textRect.right, containerRect.right) -
      Math.max(textRect.left, containerRect.left),
  );
}
