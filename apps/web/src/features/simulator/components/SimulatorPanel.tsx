"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryStates } from "nuqs";
import { Home, Lock, LogOut, RotateCw, Tablet } from "lucide-react";

import { useTerminalStore } from "@/features/terminal/store/use-terminal-store";
import { queuePaneInput } from "@/features/terminal/lib/queued-pane-input";
import { checkForUpdate } from "@/features/settings/hooks/use-updater";
import { useLayoutSettingsStore } from "@/features/settings/store/layout-settings-store";
import {
  desktopInvoke,
  isDesktopBridgeError,
  isElectronShell,
} from "@/shared/lib/desktop-bridge";
import { openDesktopExternalUrl } from "@/shared/lib/desktop-external-url";
import { centerStageParams } from "@/shared/lib/nuqs/searchParams";
import { cn } from "@/shared/lib/utils";
import { Button } from "@workspace/ui/components/ui/button";

import { SimulatorScreen } from "./SimulatorScreen";
import {
  SimulatorSetupCard,
  type SetupAction,
} from "./SimulatorSetupCard";
import {
  ensureSimulatorEventBridge,
  useSimulatorSession,
  useSimulatorSessionStore,
  type SessionView,
} from "@/features/simulator/store/use-simulator-session-store";

type SimulatorPanelProps = {
  workspaceId: string | null;
  isActive: boolean;
  surface: "sidebar" | "center";
  worktreePath?: string | null;
  className?: string;
};

export function SimulatorPanel({
  workspaceId,
  isActive,
  surface,
  worktreePath,
  className,
}: SimulatorPanelProps) {
  const t = useTranslations("simulator");
  const electron = isElectronShell();
  const workspaceKey = workspaceId ?? "";
  const slice = useSimulatorSession(workspaceKey);
  const simulatorWebrtcOptIn = useLayoutSettingsStore((state) => state.simulatorWebrtcOptIn);
  const [, setUrlParams] = useQueryStates(centerStageParams);
  const createTerminalTabWithInitialPane = useTerminalStore(
    (state) => state.createTerminalTabWithInitialPane,
  );
  const [orientation, setOrientation] = useState<"portrait" | "landscape_left">("portrait");
  const session = slice.session;
  const streamKey = `${session.streamBaseUrl ?? ""}:${session.transport ?? ""}:${session.codec ?? ""}`;
  const firstFrameKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!electron) return;
    void ensureSimulatorEventBridge();
  }, [electron]);

  useEffect(() => {
    if (!electron || !workspaceId) return;
    return () => {
      const store = useSimulatorSessionStore.getState();
      store.setSurfaceVisible(workspaceId, surface, false);
      if (useSimulatorSessionStore.getState().visibleSurfaceCount(workspaceId) === 0) {
        void desktopInvoke("simulator_visibility", {
          workspaceId,
          visible: false,
        }).catch(() => undefined);
      }
    };
  }, [electron, surface, workspaceId]);

  useEffect(() => {
    if (!electron || !workspaceId) return;
    const store = useSimulatorSessionStore.getState();
    store.setSurfaceVisible(workspaceId, surface, isActive);
    const visible =
      useSimulatorSessionStore.getState().visibleSurfaceCount(workspaceId) > 0;
    void desktopInvoke("simulator_visibility", {
      workspaceId,
      visible,
    }).catch(() => undefined);
  }, [electron, isActive, surface, workspaceId]);

  const beginAttach = useCallback(() => {
    if (!electron || !workspaceId) return false;
    const store = useSimulatorSessionStore.getState();
    if (!store.beginAttachIfIdle(workspaceId)) return false;
    void (async () => {
      try {
        await ensureSimulatorEventBridge();
        const result = await desktopInvoke<SessionView>("simulator_attach", {
          workspaceId,
          webrtc: simulatorWebrtcOptIn,
        });
        if (result && typeof result === "object" && "phase" in result) {
          useSimulatorSessionStore.getState().applyStatus(workspaceId, result);
        }
      } catch (error) {
        if (!isDesktopBridgeError(error)) return;
        useSimulatorSessionStore.getState().applyStatus(workspaceId, {
          phase: "setup_required",
          workspaceId,
          simulator: null,
          streamBaseUrl: null,
          transport: null,
          codec: null,
          size: null,
          lastError: { code: error.code, message: error.message },
        });
      } finally {
        useSimulatorSessionStore.getState().markAttachInFlight(workspaceId, false);
      }
    })();
    return true;
  }, [electron, simulatorWebrtcOptIn, workspaceId]);

  useEffect(() => {
    if (!electron || !isActive || !workspaceId || session.phase !== "idle") return;
    beginAttach();
  }, [beginAttach, electron, isActive, session.phase, workspaceId]);

  const invokeInput = useCallback(
    (input: Record<string, unknown>) => {
      if (!workspaceId) return;
      void desktopInvoke("simulator_input", { workspaceId, ...input }).catch(() => undefined);
    },
    [workspaceId],
  );

  const handleFirstFrame = useCallback(() => {
    firstFrameKeyRef.current = streamKey;
    if (!workspaceId || !electron) return;
    void desktopInvoke("simulator_stream_event", {
      workspaceId,
      event: "first_frame",
    }).catch(() => undefined);
  }, [electron, streamKey, workspaceId]);

  useEffect(() => {
    if (!electron || !workspaceId || !session.streamBaseUrl) return;
    if (
      session.phase !== "streaming" &&
      session.phase !== "starting" &&
      session.phase !== "reconnecting"
    ) {
      return;
    }
    if (firstFrameKeyRef.current === streamKey) return;
    // No WebRTC consumer yet: fall straight to HTTP rather than waiting for a
    // first frame that this panel cannot decode.
    if (session.transport === "webrtc") {
      void desktopInvoke("simulator_stream_event", {
        workspaceId,
        event: "webrtc_unusable",
      }).catch(() => undefined);
      return;
    }
    if (session.codec !== "h264") return;
    const timer = window.setTimeout(() => {
      if (firstFrameKeyRef.current === streamKey) return;
      void desktopInvoke("simulator_stream_event", {
        workspaceId,
        event: "h264_unusable",
      }).catch(() => undefined);
    }, 8_000);
    return () => window.clearTimeout(timer);
  }, [
    electron,
    session.codec,
    session.phase,
    session.streamBaseUrl,
    session.transport,
    streamKey,
    workspaceId,
  ]);

  const handleRecheck = useCallback(() => {
    if (!workspaceId || !electron) return;
    void desktopInvoke<{ ok?: boolean }>("simulator_probe", { workspaceId, force: true })
      .then((result) => {
        if (result?.ok) beginAttach();
      })
      .catch(() => undefined);
  }, [beginAttach, electron, workspaceId]);

  const handleAction = useCallback(
    (action: SetupAction) => {
      if (!workspaceId || !electron) return;
      if (action === "reinstall" || action === "check_update") {
        void openDesktopExternalUrl("https://github.com/AruNi-01/atmos/releases");
        void checkForUpdate().catch(() => undefined);
        return;
      }
      if (action === "take_over") {
        const simulatorId = session.simulator?.id;
        if (!simulatorId) return;
        void desktopInvoke("simulator_take_over", {
          workspaceId,
          simulatorId,
        }).catch(() => undefined);
        return;
      }
      void desktopInvoke("simulator_setup_action", { action }).catch(() => undefined);
    },
    [electron, session.simulator?.id, workspaceId],
  );

  const handleDisconnect = useCallback(() => {
    if (!workspaceId || !electron) return;
    void desktopInvoke("simulator_disconnect", { workspaceId }).catch(() => undefined);
  }, [electron, workspaceId]);

  const handleOpenProject = useCallback(async () => {
    if (!workspaceId || !electron) return;
    const created = await createTerminalTabWithInitialPane(workspaceId, "workspace", {
      title: "Metro",
    });
    if (!created) return;

    const result = await desktopInvoke<{ metroCommand?: string }>("simulator_open_project", {
      workspaceId,
      worktreePath,
    });
    if (result.metroCommand) queuePaneInput(created.paneId, `${result.metroCommand}\n`);
    void setUrlParams({ tab: created.tab.id });
  }, [
    createTerminalTabWithInitialPane,
    electron,
    setUrlParams,
    worktreePath,
    workspaceId,
  ]);

  if (!electron) {
    return (
      <div className={cn("min-w-0", className)} data-simulator-surface={surface}>
        <SimulatorSetupCard
          workspaceId={workspaceKey}
          probe={null}
          lastError={{
            code: "hosted_web",
            message: t("cards.requiresDesktop"),
          }}
          phase="setup_required"
          onRecheck={() => undefined}
          onAction={() => undefined}
          showRecheck={false}
        />
      </div>
    );
  }

  const setupRequired =
    session.phase === "setup_required" ||
    session.phase === "failed" ||
    session.lastError?.code === "helper_dead" ||
    (session.phase === "reconnecting" &&
      session.lastError?.code === "reconnecting_exhausted");

  if (setupRequired) {
    return (
      <div className={cn("min-w-0", className)} data-simulator-surface={surface}>
        <SimulatorSetupCard
          workspaceId={workspaceKey}
          probe={slice.probe}
          lastError={session.lastError}
          phase={session.phase}
          onRecheck={handleRecheck}
          onAction={handleAction}
        />
      </div>
    );
  }

  const showStream =
    Boolean(session.streamBaseUrl) &&
    (session.phase === "streaming" ||
      session.phase === "starting" ||
      session.phase === "reconnecting");

  if (!showStream) {
    const latestLog = slice.logs[slice.logs.length - 1];
    return (
      <div
        className={cn(
          "flex min-h-32 min-w-0 flex-col justify-center gap-2 rounded-xl border bg-card p-4",
          className,
        )}
        aria-live="polite"
        data-simulator-surface={surface}
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <Tablet className="size-4 text-muted-foreground" />
          {t(`phases.${session.phase}`)}
        </div>
        {latestLog ? (
          <p className="text-sm text-muted-foreground">{latestLog.message}</p>
        ) : null}
      </div>
    );
  }

  return (
    <section
      className={cn("flex min-h-0 min-w-0 flex-col gap-3", className)}
      data-simulator-surface={surface}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Tablet className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {session.simulator?.name ?? t("toolbar.unnamed")}
        </span>
        <span className="text-xs text-muted-foreground">{t(`phases.${session.phase}`)}</span>
        <Button size="sm" variant="outline" onClick={handleDisconnect}>
          <LogOut className="mr-1.5 size-3.5" />
          {t("toolbar.disconnect")}
        </Button>
      </div>

      <div
        className={cn(
          "pointer-events-none relative mx-auto w-full rounded-[2.5rem] border-[10px] border-muted-foreground/30 bg-muted/30 p-1 shadow-inner",
          surface === "sidebar" ? "max-w-[220px]" : "max-w-[320px]",
        )}
      >
        <div
          className="pointer-events-none absolute inset-0 z-10 rounded-[2.5rem] border border-foreground/10"
          aria-hidden="true"
        >
          <span className="absolute left-1/2 top-2 h-4 w-20 -translate-x-1/2 rounded-full bg-foreground/15" />
          <span className="absolute bottom-2 left-1/2 h-1 w-20 -translate-x-1/2 rounded-full bg-foreground/25" />
        </div>
        <SimulatorScreen
          className="relative z-0 w-full"
          streamBaseUrl={session.streamBaseUrl}
          codec={session.codec}
          transport={session.transport}
          size={session.size}
          onFirstFrame={handleFirstFrame}
        />
      </div>

      {surface === "center" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => invokeInput({ op: "button", button: "home" })}>
            <Home className="mr-1.5 size-3.5" />
            {t("toolbar.home")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => invokeInput({ op: "button", button: "lock" })}>
            <Lock className="mr-1.5 size-3.5" />
            {t("toolbar.lock")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const next = orientation === "portrait" ? "landscape_left" : "portrait";
              setOrientation(next);
              invokeInput({ op: "orientation", orientation: next });
            }}
          >
            <RotateCw className="mr-1.5 size-3.5" />
            {t("toolbar.rotate")}
          </Button>
          <Button size="sm" onClick={() => void handleOpenProject()}>
            {t("toolbar.openInSimulator")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

export type { SimulatorPanelProps };
