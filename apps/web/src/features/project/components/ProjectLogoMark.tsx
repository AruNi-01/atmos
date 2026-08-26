"use client";

import { useState } from "react";
import { cn } from "@workspace/ui";
import {
  classifyProjectLogoImage,
  getCachedProjectLogoTone,
  setCachedProjectLogoTone,
  type ProjectLogoTone,
} from "@/features/project/lib/project-logo-tone";

export function ProjectLogoMark({
  src,
  className,
  onError,
}: {
  src: string;
  className?: string;
  onError?: () => void;
}) {
  const [classified, setClassified] = useState<{
    src: string;
    tone: ProjectLogoTone;
  } | null>(() => {
    const cached = getCachedProjectLogoTone(src);
    return cached ? { src, tone: cached } : null;
  });
  const tone =
    classified?.src === src
      ? classified.tone
      : (getCachedProjectLogoTone(src) ?? null);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      draggable={false}
      className={cn(
        "size-full rounded-[inherit] object-cover",
        tone === "invert-light" && "invert dark:invert-0",
        tone === "invert-dark" && "dark:invert",
        className,
      )}
      onLoad={(event) => {
        if (event.currentTarget.getAttribute("src") !== src) {
          return;
        }
        const next =
          getCachedProjectLogoTone(src) ??
          classifyProjectLogoImage(event.currentTarget);
        setCachedProjectLogoTone(src, next);
        setClassified({ src, tone: next });
      }}
      onError={onError}
    />
  );
}
