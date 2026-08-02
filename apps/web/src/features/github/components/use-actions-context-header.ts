import React from "react";

export function useActionsContextHeader() {
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const contextElementRef = React.useRef<HTMLDivElement | null>(null);
  const [contextElement, setContextElement] =
    React.useState<HTMLDivElement | null>(null);
  const contextHeightRef = React.useRef(64);
  const contextVisibleRef = React.useRef(true);
  const lastScrollTopRef = React.useRef(0);

  const applyContextVisibility = React.useCallback(
    (element: HTMLDivElement, visible: boolean) => {
      element.style.transform = visible
        ? "translate3d(0, 0, 0)"
        : "translate3d(0, calc(-100% - 1px), 0)";
    },
    [],
  );

  const contextRef = React.useCallback(
    (element: HTMLDivElement | null) => {
      contextElementRef.current = element;
      setContextElement(element);
      if (element) {
        applyContextVisibility(element, contextVisibleRef.current);
      }
    },
    [applyContextVisibility],
  );

  const setContextVisible = React.useCallback(
    (visible: boolean) => {
      if (contextVisibleRef.current === visible) return;
      contextVisibleRef.current = visible;
      const element = contextElementRef.current;
      if (element) applyContextVisibility(element, visible);
    },
    [applyContextVisibility],
  );

  const resetContext = React.useCallback(() => {
    setContextVisible(true);
    lastScrollTopRef.current = 0;
    scrollRef.current?.scrollTo({ top: 0 });
  }, [setContextVisible]);

  React.useEffect(() => {
    if (!contextElement) return;

    const updateHeight = () => {
      contextHeightRef.current =
        contextElement.getBoundingClientRect().height || 64;
    };

    updateHeight();
    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(contextElement);
    return () => resizeObserver.disconnect();
  }, [contextElement]);

  const handleScroll = React.useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const nextTop = event.currentTarget.scrollTop;
      const delta = nextTop - lastScrollTopRef.current;
      const hideThreshold = Math.max(48, contextHeightRef.current * 0.7);

      if (nextTop < 12) {
        setContextVisible(true);
      } else if (delta > 8 && nextTop > hideThreshold) {
        setContextVisible(false);
      } else if (delta < -8) {
        setContextVisible(true);
      }

      lastScrollTopRef.current = nextTop;
    },
    [setContextVisible],
  );

  const handleWheelCapture = React.useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (event.deltaY > 8) {
        setContextVisible(false);
      } else if (event.deltaY < -8) {
        setContextVisible(true);
      }
    },
    [setContextVisible],
  );

  return {
    contextRef,
    handleScroll,
    handleWheelCapture,
    resetContext,
    scrollRef,
  };
}
