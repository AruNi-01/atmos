"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { HostedLandingLoading } from "@/app-shell/HostedLandingLoading";
import { useDesktopStartupPrefetchLoading } from "@/app-shell/bootstrap/DesktopStartupPrefetchBootstrap";
import { HostedWelcomeGate } from "@/features/welcome/components/HostedWelcomeGate";
import { useHostedConnectionStore } from "@/features/connection/store/hosted-connection-store";
import { hasPtDesignCollabInvite } from "@/features/pt-design/collab-invite";
import { isHostedAtmosOrigin } from "@/shared/lib/desktop-runtime";

const PtDesignGuestStage = dynamic(
  () =>
    import("@/features/pt-design/PtDesignGuestStage").then(
      (mod) => mod.PtDesignGuestStage,
    ),
  { ssr: false },
);

interface HostedBootstrapBoundaryProps {
  children: React.ReactNode;
}

type HostedBootstrapPhase = "loading" | "onboarding" | "ready";

const subscribeMounted = () => () => {};
const getClientMountedSnapshot = () => true;
const getServerMountedSnapshot = () => false;
const DESKTOP_LOADING_EXIT_MS = 280;

function resolveHostedBootstrapPhase(
  mounted: boolean,
  hosted: boolean,
  bootstrapState: "idle" | "checking" | "onboarding" | "connected",
): HostedBootstrapPhase {
  if (!mounted || !hosted) {
    return "ready";
  }

  if (bootstrapState === "idle" || bootstrapState === "checking") {
    return "loading";
  }

  if (bootstrapState === "onboarding") {
    return "onboarding";
  }

  return "ready";
}

function DesktopStartupTransition({
  children,
  loading,
}: HostedBootstrapBoundaryProps & { loading: boolean }) {
  const [renderLoading, setRenderLoading] = useState(loading);

  useEffect(() => {
    if (loading || !renderLoading) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setRenderLoading(false);
    }, DESKTOP_LOADING_EXIT_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [loading, renderLoading]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 animate-in flex-col fade-in slide-in-from-bottom-1 duration-200">
        {children}
      </div>

      {renderLoading ? (
        <div
          className={`absolute inset-0 z-[100] flex bg-background transition-opacity duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
            loading ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          aria-hidden={!loading}
        >
          <HostedLandingLoading />
        </div>
      ) : null}
    </div>
  );
}

export function HostedBootstrapBoundary({
  children,
}: HostedBootstrapBoundaryProps) {
  const mounted = useSyncExternalStore(
    subscribeMounted,
    getClientMountedSnapshot,
    getServerMountedSnapshot,
  );
  const bootstrapState = useHostedConnectionStore((s) => s.bootstrapState);
  const hosted = mounted ? isHostedAtmosOrigin() : false;
  const desktopStartupLoading = useDesktopStartupPrefetchLoading(
    mounted && !hosted,
  );
  const collabInviteOnLoad = useMemo(
    () => (mounted ? hasPtDesignCollabInvite() : false),
    [mounted],
  );

  if (!mounted) {
    return <div className="flex min-h-0 flex-1 bg-background" />;
  }

  const phase = resolveHostedBootstrapPhase(mounted, hosted, bootstrapState);

  if (!hosted) {
    return (
      <DesktopStartupTransition loading={desktopStartupLoading}>
        {children}
      </DesktopStartupTransition>
    );
  }

  // Plain div + CSS enter fade only — do not wrap TextShimmer in motion/AnimatePresence
  // (see Footer ticker comment: nested motion interrupts backgroundPosition shimmer).
  if (phase === "loading") {
    return (
      <div key="hosted-shell-loading" className="flex min-h-0 flex-1 animate-in bg-background fade-in duration-200">
        <HostedLandingLoading />
      </div>
    );
  }

  if (phase === "onboarding") {
    if (collabInviteOnLoad) {
      return (
        <div
          key="hosted-shell-pt-design-guest"
          className="flex min-h-0 flex-1 animate-in flex-col bg-background fade-in duration-200"
        >
          <PtDesignGuestStage />
        </div>
      );
    }
    return (
      <div
        key="hosted-shell-onboarding"
        className="flex min-h-0 flex-1 animate-in bg-background fade-in slide-in-from-bottom-2 duration-200"
      >
        <HostedWelcomeGate />
      </div>
    );
  }

  return (
    <div key="hosted-shell-ready" className="flex min-h-0 flex-1 animate-in flex-col fade-in slide-in-from-bottom-1 duration-200">
      {children}
    </div>
  );
}

export function HostedAppShellGate(props: HostedBootstrapBoundaryProps) {
  return <HostedBootstrapBoundary {...props} />;
}
