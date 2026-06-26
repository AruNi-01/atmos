"use client";

import React from "react";

import {
  AppNavigationInterceptProvider,
  type AppNavigationInterceptor,
} from "@/shared/hooks/app-navigation-intercept";
import { useCanvasRuntimeStore } from "@/features/canvas/store/canvas-runtime-store";

type CanvasWidgetHostValue = {
  widgetLabel: string | null;
  notifyUnsupported: (info?: { targetPath?: string | null }) => void;
};

const CanvasWidgetHostContext = React.createContext<CanvasWidgetHostValue | null>(null);

/**
 * Wraps a Canvas widget body so that clickable elements inside reused app
 * panels degrade gracefully. App-route navigation triggered through
 * `useAppRouter` is intercepted and surfaced as a notice modal instead of
 * leaving the Canvas. Widgets can also call `notifyUnsupported()` directly for
 * actions they know Canvas cannot host.
 */
export function CanvasWidgetHostProvider({
  widgetLabel,
  children,
}: {
  widgetLabel: string | null;
  children: React.ReactNode;
}) {
  const showUnsupportedInteraction = useCanvasRuntimeStore(
    (state) => state.showUnsupportedInteraction,
  );

  const notifyUnsupported = React.useCallback(
    (info?: { targetPath?: string | null }) => {
      showUnsupportedInteraction({
        widgetLabel,
        targetPath: info?.targetPath ?? null,
      });
    },
    [showUnsupportedInteraction, widgetLabel],
  );

  const interceptor = React.useCallback<AppNavigationInterceptor>(
    (target) => {
      notifyUnsupported({ targetPath: target.path });
      return true;
    },
    [notifyUnsupported],
  );

  const value = React.useMemo<CanvasWidgetHostValue>(
    () => ({ widgetLabel, notifyUnsupported }),
    [notifyUnsupported, widgetLabel],
  );

  return (
    <CanvasWidgetHostContext.Provider value={value}>
      <AppNavigationInterceptProvider interceptor={interceptor}>
        {children}
      </AppNavigationInterceptProvider>
    </CanvasWidgetHostContext.Provider>
  );
}

export function useCanvasWidgetHost(): CanvasWidgetHostValue | null {
  return React.useContext(CanvasWidgetHostContext);
}
