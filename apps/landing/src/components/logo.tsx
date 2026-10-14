"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { TextScramble } from "@workspace/ui/components/ui/text-scramble";
import LogoSvg from "@workspace/ui/components/logo-svg";

const Logo = ({ className }: { className?: string }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={cn("group flex items-center gap-3", className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <LogoSvg className="h-6 w-auto cursor-default text-primary" />
      <div className="relative pl-1 whitespace-nowrap">
        <TextScramble
          className="inline-block min-w-[5ch] cursor-default text-xl font-bold tracking-widest text-primary uppercase tabular-nums select-none"
          trigger={isHovered}
        >
          ATMOS
        </TextScramble>
      </div>
    </div>
  );
};

export default Logo;
