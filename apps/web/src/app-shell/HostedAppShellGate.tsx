"use client";

import { useEffect, useState } from "react";
import { HostedLandingLoading } from "@/app-shell/HostedLandingLoading";
import { HostedWelcomeGate } from "@/features/welcome/components/HostedWelcomeGate";
import { useHostedConnectionStore } from "@/features/connection/store/hosted-connection-store";
import { isHostedAtmosOrigin } from "@/shared/lib/desktop-runtime";

interface HostedBootstrapBoundaryProps {
  children: React.ReactNode;
}

type HostedBootstrapPhase = "loading" | "onboarding" | "ready";

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

export function HostedBootstrapBoundary({
  children,
}: HostedBootstrapBoundaryProps) {
  const [mounted, setMounted] = useState(false);
  const bootstrapState = useHostedConnectionStore((s) => s.bootstrapState);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="flex min-h-0 flex-1 bg-background" />;
  }

  const hosted = isHostedAtmosOrigin();
  const phase = resolveHostedBootstrapPhase(mounted, hosted, bootstrapState);

  // Plain div + CSS enter fade only — do not wrap TextShimmer in motion/AnimatePresence
  // (see Footer ticker comment: nested motion interrupts backgroundPosition shimmer).
  if (phase === "loading") {
    return (
      <div
        key="hosted-shell-loading"
        className="flex min-h-0 flex-1 animate-in bg-background fade-in duration-200"
      >
        <HostedLandingLoading />
      </div>
    );
  }

  if (phase === "onboarding") {
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
    <div
      key="app-shell"
      className="flex min-h-0 flex-1 animate-in flex-col fade-in slide-in-from-bottom-1 duration-200"
    >
      {children}
    </div>
  );
}

export function HostedAppShellGate(props: HostedBootstrapBoundaryProps) {
  return <HostedBootstrapBoundary {...props} />;
}
