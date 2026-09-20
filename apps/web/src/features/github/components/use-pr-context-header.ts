import React from "react";

export function usePrContextHeader() {
  const mainScrollRef = React.useRef<HTMLDivElement | null>(null);

  const resetPrContext = React.useCallback(() => {
    mainScrollRef.current?.scrollTo({ top: 0 });
  }, []);

  const handleFilesCodeViewTopBoundaryWheel = React.useCallback(
    (deltaY: number) => {
      const scrollRoot = mainScrollRef.current;
      if (!scrollRoot || deltaY >= 0) return;
      scrollRoot.scrollTop = Math.max(0, scrollRoot.scrollTop + deltaY);
    },
    [],
  );

  return {
    handleFilesCodeViewTopBoundaryWheel,
    mainScrollRef,
    resetPrContext,
  };
}
