"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "motion/react";
import { cn } from "../../lib/utils";

export type AvatarStackUser = {
  name: string;
  img?: string;
  id?: string;
  content?: ReactNode;
};

export type AvatarStackProps = {
  users: AvatarStackUser[];
  variant?: "spring-tilt" | "spring-box" | "slide-blur";
  size?: "xs" | "sm" | "md";
  className?: string;
  avatarClassName?: string;
  tooltipClassName?: string;
};

const sizeClasses = {
  xs: "size-4",
  sm: "size-5",
  md: "size-7",
} as const;

const overlapClasses = {
  xs: "-ml-1.5",
  sm: "-ml-2",
  md: "-ml-2.5",
} as const;

function AvatarStackItem({
  user,
  idx,
  variant,
  size,
  avatarClassName,
  tooltipClassName,
}: {
  user: AvatarStackUser;
  idx: number;
  variant: NonNullable<AvatarStackProps["variant"]>;
  size: NonNullable<AvatarStackProps["size"]>;
  avatarClassName?: string;
  tooltipClassName?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const [direction, setDirection] = useState(0);
  const x = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 120, damping: variant === "spring-tilt" ? 16 : 20 });
  const rotate = useTransform(springX, [-40, 40], [-6, 6]);

  const enter = (event: MouseEvent<HTMLDivElement>) => {
    if (variant === "slide-blur") {
      const bounds = event.currentTarget.getBoundingClientRect();
      setDirection(event.clientX - bounds.left < bounds.width / 2 ? -16 : 16);
    }
    setHovered(true);
  };

  const leave = (event: MouseEvent<HTMLDivElement>) => {
    setHovered(false);
    if (variant === "slide-blur") {
      const bounds = event.currentTarget.getBoundingClientRect();
      setDirection(event.clientX - bounds.left < bounds.width / 2 ? -16 : 16);
    } else {
      x.set(0);
    }
  };

  const move = (event: MouseEvent<HTMLDivElement>) => {
    if (variant === "slide-blur") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    x.set(event.clientX - bounds.left - bounds.width / 2);
  };

  return (
    <div
      className={cn("group relative", idx !== 0 && overlapClasses[size])}
      style={{ zIndex: hovered ? 50 : idx + 1 }}
      onMouseEnter={enter}
      onMouseLeave={leave}
      onMouseMove={move}
    >
      <motion.div
        layoutId={user.id}
        className={cn(
          "relative overflow-hidden rounded-full ring-1 ring-background",
          sizeClasses[size],
          avatarClassName,
        )}
      >
        {user.content ? (
          user.content
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- avatar stack renders remote or data URLs
          <img src={user.img} alt="" className="size-full object-cover" />
        )}
      </motion.div>

      <AnimatePresence>
        {hovered && user.name ? (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.92 }}
            animate={{ opacity: 1, y: -6, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.92 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            style={variant === "slide-blur" ? undefined : { x: springX, rotate }}
            className={cn(
              "pointer-events-none absolute -top-7 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center",
              tooltipClassName,
            )}
          >
            <div className="overflow-hidden rounded-md bg-foreground px-2 py-0.5 text-[11px] whitespace-nowrap text-background">
              {variant === "slide-blur" ? (
                <motion.div
                  initial={{ x: direction, filter: "blur(4px)" }}
                  animate={{ x: 0, filter: "blur(0px)" }}
                  exit={{ x: direction, filter: "blur(4px)" }}
                  transition={{ type: "spring", stiffness: 320, damping: 24 }}
                >
                  {user.name}
                </motion.div>
              ) : (
                user.name
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function AvatarStack({
  users,
  variant = "spring-tilt",
  size = "md",
  className,
  avatarClassName,
  tooltipClassName,
}: AvatarStackProps) {
  return (
    <div className={cn("relative flex items-center", className)}>
      {users.map((user, idx) => (
        <AvatarStackItem
          key={user.id ?? `${user.name}-${idx}`}
          user={user}
          idx={idx}
          variant={variant}
          size={size}
          avatarClassName={avatarClassName}
          tooltipClassName={tooltipClassName}
        />
      ))}
    </div>
  );
}
