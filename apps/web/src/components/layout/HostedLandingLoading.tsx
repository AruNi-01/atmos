"use client";

import { motion } from "motion/react";
import { TextShimmer } from "@workspace/ui";
import { AtmosWordmark } from "@/components/ui/AtmosWordmark";

export function HostedLandingLoading() {
  return (
    <div className="flex flex-1 items-center justify-center bg-background px-6 py-10 sm:px-10 lg:px-16">
      <div className="flex w-full max-w-4xl flex-col items-center text-center">
        <AtmosWordmark
          className="w-full"
          letterClassName="text-[5.25rem] font-semibold sm:text-[7rem] lg:text-[8.25rem]"
          logoClassName="size-24 sm:size-28 lg:size-32"
          sloganClassName="hidden"
        />
        <TextShimmer className="pt-5 text-center text-lg font-semibold tracking-wide sm:text-xl lg:text-2xl">
          Atmosphere for Agentic Builders
        </TextShimmer>

        <div className="mt-12 flex items-center gap-2.5 text-sm font-medium tracking-[0.16em] text-muted-foreground/80 uppercase">
          <p>
            Loading
          </p>
          <div className="flex items-center gap-1.5">
            {[0, 1, 2].map((index) => (
              <motion.span
                key={index}
                className="size-1.5 rounded-full bg-foreground/75"
                animate={{
                  opacity: [0.25, 1, 0.25],
                  scale: [0.9, 1.08, 0.9],
                }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: index * 0.16,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
