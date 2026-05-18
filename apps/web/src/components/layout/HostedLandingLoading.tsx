"use client";

import { motion } from "motion/react";
import { AtmosWordmark } from "@/components/ui/AtmosWordmark";
import { HostedSloganShimmer } from "@/components/ui/HostedSloganShimmer";

function LoadingProgress() {
  return (
    <div className="mt-14 flex w-full max-w-[14rem] flex-col items-center gap-4 sm:mt-16 sm:max-w-xs">
      <motion.div
        className="relative h-px w-full overflow-hidden rounded-full bg-border/80"
        aria-hidden
      >
        <motion.div
          className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-foreground/50"
          animate={{ x: ["-120%", "320%"] }}
          transition={{
            duration: 2.1,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </motion.div>
      <p className="text-[11px] font-medium tracking-[0.2em] text-muted-foreground/75 uppercase sm:text-xs">
        Connecting
      </p>
    </div>
  );
}

export function HostedLandingLoading() {
  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-background">
      <div
        className="pointer-events-none absolute inset-0 animate-in fade-in duration-700"
        aria-hidden
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_55%_at_50%_0%,color-mix(in_oklab,var(--foreground)_7%,transparent),transparent_65%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_45%_at_50%_100%,color-mix(in_oklab,var(--foreground)_4%,transparent),transparent)]" />
        <div className="absolute inset-0 opacity-[0.22] [background-image:radial-gradient(circle_at_center,color-mix(in_oklab,var(--foreground)_7%,transparent)_1px,transparent_1px)] [background-size:22px_22px]" />
      </div>

      <motion.div
        className="relative z-10 flex w-full max-w-2xl flex-col items-center px-6 py-12 text-center sm:px-10"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: "easeOut" }}
      >
        <AtmosWordmark
          layout="compact"
          className="w-full"
          letterClassName="text-[4.5rem] font-normal sm:text-[5.75rem] lg:text-[6.5rem]"
          logoClassName="size-[4.5rem] drop-shadow-[0_0_28px_color-mix(in_oklab,var(--foreground)_18%,transparent)] sm:size-[5.25rem] lg:size-24"
          sloganClassName="hidden"
        />

        <HostedSloganShimmer className="pt-4 text-base font-normal text-muted-foreground/90 sm:pt-5 sm:text-lg" />

        <LoadingProgress />
      </motion.div>
    </div>
  );
}
