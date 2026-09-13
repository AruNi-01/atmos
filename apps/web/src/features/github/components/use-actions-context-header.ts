import React from "react";

export function useActionsContextHeader() {
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  const resetContext = React.useCallback(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, []);

  return {
    resetContext,
    scrollRef,
  };
}
