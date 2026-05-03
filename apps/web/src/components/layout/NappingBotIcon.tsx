"use client";

import React from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

type NappingBotIconProps = {
  className?: string;
};

const Z_POSITIONS = [
  { right: "-0.02rem", top: "-0.05rem" },
  { right: "-0.3rem", top: "-0.38rem" },
  { right: "-0.58rem", top: "-0.72rem" },
];

export function NappingBotIcon({ className }: NappingBotIconProps) {
  return (
    <span className={cn("relative inline-flex size-3.5 items-center justify-center", className)} aria-hidden>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-3.5 text-muted-foreground"
      >
        <path d="M12 3v2.2" />
        <path d="M7.6 8h8.8a2 2 0 0 1 2 2v6.4a2 2 0 0 1-2 2H7.6a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Z" />
        <path d="M9.1 12.3h1.8" />
        <path d="M13.1 12.3h1.8" />
        <path d="M9.4 15.5c.7.6 1.6.9 2.6.9s1.9-.3 2.6-.9" />
      </svg>

      {Z_POSITIONS.map((position, index) => (
        <motion.span
          key={`${position.right}-${position.top}`}
          className="absolute text-[6px] font-semibold leading-none text-muted-foreground/75 select-none"
          style={position}
          initial={{ opacity: 0, y: 1.5, scale: 0.92 }}
          animate={{ opacity: [0, 1, 0], y: [1.5, -0.5, -2.5], scale: [0.92, 1, 1.05] }}
          transition={{
            duration: 1.8,
            delay: index * 0.28,
            repeat: Number.POSITIVE_INFINITY,
            repeatDelay: 0.36,
            ease: "easeInOut",
          }}
        >
          z
        </motion.span>
      ))}
    </span>
  );
}
