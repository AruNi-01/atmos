import React from "react";

type PRMainTab = "description" | "checks" | "discussion" | "commits" | "files";

export function usePrContextHeader(activeMainTab: PRMainTab) {
  const mainScrollRef = React.useRef<HTMLDivElement | null>(null);
  const prContextElementRef = React.useRef<HTMLDivElement | null>(null);
  const [prContextElement, setPrContextElement] =
    React.useState<HTMLDivElement | null>(null);
  const prContextHeightRef = React.useRef(64);
  const prContextVisibleRef = React.useRef(true);
  const lastMainScrollTopRef = React.useRef(0);

  const applyPrContextVisibility = React.useCallback(
    (element: HTMLDivElement, visible: boolean) => {
      element.style.transform = visible
        ? "translate3d(0, 0, 0)"
        : "translate3d(0, calc(-100% - 1px), 0)";
    },
    [],
  );

  const prContextRef = React.useCallback(
    (element: HTMLDivElement | null) => {
      prContextElementRef.current = element;
      setPrContextElement(element);
      if (element) {
        applyPrContextVisibility(element, prContextVisibleRef.current);
      }
    },
    [applyPrContextVisibility],
  );

  const setPrContextVisible = React.useCallback((visible: boolean) => {
    if (prContextVisibleRef.current === visible) return;
    prContextVisibleRef.current = visible;
    const element = prContextElementRef.current;
    if (!element) return;
    applyPrContextVisibility(element, visible);
  }, [applyPrContextVisibility]);

  const getPrContextMetrics = React.useCallback(() => {
    const contextHeight = prContextHeightRef.current;
    return {
      contextHeight,
      hideThreshold: Math.max(48, contextHeight * 0.7),
    };
  }, []);

  const resetPrContext = React.useCallback(() => {
    setPrContextVisible(true);
    lastMainScrollTopRef.current = 0;
    mainScrollRef.current?.scrollTo({ top: 0 });
  }, [setPrContextVisible]);

  React.useEffect(() => {
    const element = prContextElement;
    if (!element) return;

    const updateHeight = () => {
      prContextHeightRef.current = element.getBoundingClientRect().height || 64;
    };

    updateHeight();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateHeight);
      return () => window.removeEventListener("resize", updateHeight);
    }

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, [prContextElement]);

  const handleMainScroll = React.useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const nextTop = event.currentTarget.scrollTop;
      const delta = nextTop - lastMainScrollTopRef.current;
      const { hideThreshold } = getPrContextMetrics();

      if (nextTop < 12) {
        setPrContextVisible(true);
      } else if (delta > 8 && nextTop > hideThreshold) {
        setPrContextVisible(false);
      } else if (delta < -8) {
        setPrContextVisible(true);
      }

      lastMainScrollTopRef.current = nextTop;
    },
    [getPrContextMetrics, setPrContextVisible],
  );

  const handleMainWheelCapture = React.useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      const scrollTop = mainScrollRef.current?.scrollTop ?? 0;
      const { contextHeight, hideThreshold } = getPrContextMetrics();

      if (
        activeMainTab === "files" &&
        event.deltaY > 8 &&
        scrollTop <= hideThreshold
      ) {
        const nextTop = Math.max(contextHeight, hideThreshold + 1);
        mainScrollRef.current?.scrollTo({ top: nextTop });
        lastMainScrollTopRef.current = nextTop;
        setPrContextVisible(false);
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (event.deltaY > 8 && scrollTop > hideThreshold) {
        setPrContextVisible(false);
      } else if (event.deltaY < -8) {
        setPrContextVisible(true);
      }
    },
    [activeMainTab, getPrContextMetrics, setPrContextVisible],
  );

  const handleFilesCodeViewTopBoundaryWheel = React.useCallback(
    (deltaY: number) => {
      const scrollRoot = mainScrollRef.current;
      if (!scrollRoot || deltaY >= 0) return;
      const nextTop = Math.max(0, scrollRoot.scrollTop + deltaY);
      scrollRoot.scrollTop = nextTop;
      lastMainScrollTopRef.current = nextTop;
      setPrContextVisible(true);
    },
    [setPrContextVisible],
  );

  return {
    handleFilesCodeViewTopBoundaryWheel,
    handleMainScroll,
    handleMainWheelCapture,
    mainScrollRef,
    prContextRef,
    resetPrContext,
  };
}
