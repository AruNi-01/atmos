"use client";

import { SparklesCore, cn } from "@workspace/ui";

/** Aceternity Sparkles horizon under the New Workspace composer. */
export function WelcomeComposerSparkles({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none relative mx-auto h-40 w-[min(40rem,70%)] overflow-hidden",
        className,
      )}
    >
      <div className="absolute top-0 left-1/2 h-[2px] w-3/4 -translate-x-1/2 bg-gradient-to-r from-transparent via-foreground/70 to-transparent blur-sm" />
      <div className="absolute top-0 left-1/2 h-px w-3/4 -translate-x-1/2 bg-gradient-to-r from-transparent via-foreground to-transparent" />
      <div className="absolute top-0 left-1/2 h-[5px] w-1/4 -translate-x-1/2 bg-gradient-to-r from-transparent via-foreground/80 to-transparent blur-sm" />
      <div className="absolute top-0 left-1/2 h-px w-1/4 -translate-x-1/2 bg-gradient-to-r from-transparent via-foreground to-transparent" />

      <SparklesCore
        background="transparent"
        minSize={0.4}
        maxSize={1}
        particleDensity={1200}
        particleColor="#FFFFFF"
        className="h-full w-full [mask-image:radial-gradient(350px_200px_at_top,white_20%,transparent)] invert dark:invert-0"
      />
    </div>
  );
}
