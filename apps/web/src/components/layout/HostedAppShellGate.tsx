"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { HostedLandingLoading } from "@/components/layout/HostedLandingLoading";
import { HostedWelcomeGate } from "@/components/welcome/HostedWelcomeGate";
import { useHostedConnectionStore } from "@/hooks/use-hosted-connection-store";
import { isHostedAtmosOrigin } from "@/lib/desktop-runtime";

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

  return (
    <AnimatePresence initial={false} mode="wait">
      {phase === "loading" ? (
        <motion.div
          key="hosted-shell-loading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="flex min-h-0 flex-1 bg-background"
        >
          <HostedLandingLoading />
        </motion.div>
      ) : phase === "onboarding" ? (
        <motion.div
          key="hosted-shell-onboarding"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="flex min-h-0 flex-1 bg-background"
        >
          <HostedWelcomeGate />
        </motion.div>
      ) : (
        <motion.div
          key="app-shell"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="flex min-h-0 flex-1 flex-col"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function HostedAppShellGate(props: HostedBootstrapBoundaryProps) {
  return <HostedBootstrapBoundary {...props} />;
}
