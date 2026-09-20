"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import LogoSvg from "@workspace/ui/components/logo-svg";
import { cn } from "@workspace/ui";
import {
  composerDockMotion,
  composerLogoChrome,
  heroComposerOffset,
} from "@/features/agent/lib/agent-chat-composer-dock";

export function AgentChatComposerDock({
  landing,
  wideContentClassName,
  children,
}: {
  landing: boolean;
  wideContentClassName: string;
  children: React.ReactNode;
}) {
  const reduceMotion = Boolean(useReducedMotion());
  const stackRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const [measured, setMeasured] = useState(!landing);

  useLayoutEffect(() => {
    const stack = stackRef.current;
    const column = stack?.closest("[data-agent-chat-column]");
    if (!(stack instanceof HTMLElement) || !(column instanceof HTMLElement)) return;

    const measure = () => {
      if (!landing) return;
      const next = heroComposerOffset(column.clientHeight, stack.offsetHeight);
      setOffset((current) => (current === next ? current : next));
      setMeasured(true);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(column);
    observer.observe(stack);
    return () => observer.disconnect();
  }, [landing]);

  const docked = !landing;
  const motionSpec = composerDockMotion(docked, reduceMotion);
  const logo = composerLogoChrome(docked, reduceMotion);

  return (
    <motion.div
      ref={stackRef}
      data-agent-chat-composer-dock=""
      className={cn("relative z-10 w-full shrink-0", wideContentClassName)}
      // 单实例视觉连续性：新挂载的 landing 也从 dock（y=0）滑到中间，
      // 和同面板内底部 new chat 的 bottom→center 复用同一条曲线。
      initial={{ y: 0 }}
      animate={{ y: docked ? 0 : offset }}
      transition={{ duration: motionSpec.duration, ease: motionSpec.ease }}
      style={!measured && landing ? { visibility: "hidden" } : undefined}
    >
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-full flex justify-center px-3 pb-14"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: logo.opacity, y: logo.y }}
        transition={{
          duration: logo.duration,
          delay: logo.delay,
          ease: motionSpec.ease,
        }}
      >
        <LogoSvg className="h-20 w-auto text-foreground" />
      </motion.div>
      {children}
    </motion.div>
  );
}
