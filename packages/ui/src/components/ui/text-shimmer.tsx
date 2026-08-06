'use client';
import React, { useMemo, type JSX } from 'react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';

export type TextShimmerProps = {
  children: string;
  as?: React.ElementType;
  className?: string;
  style?: React.CSSProperties;
  duration?: number;
  spread?: number;
};

function TextShimmerComponent({
  children,
  as: Component = 'p',
  className,
  style,
  duration = 2,
  spread = 2,
}: TextShimmerProps) {
  // Prefer motion.<tag> for intrinsic elements. motion.create() has produced
  // null element types during Next 16.3 Turbopack Windows prerender (CI).
  const MotionComponent = useMemo(() => {
    if (typeof Component === 'string') {
      const preset = (motion as unknown as Record<string, unknown>)[Component];
      if (typeof preset === 'object' && preset !== null) {
        return preset as React.ElementType;
      }
    }
    const created = motion.create(Component as keyof JSX.IntrinsicElements);
    if (created) {
      return created as React.ElementType;
    }
    return Component;
  }, [Component]);

  const dynamicSpread = useMemo(() => {
    return children.length * spread;
  }, [children, spread]);

  const shimmerClassName = cn(
    'relative inline-block bg-[length:250%_100%,auto] bg-clip-text',
    'text-transparent [--base-color:#a1a1aa] [--base-gradient-color:#000]',
    '[background-repeat:no-repeat,padding-box] [--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--base-gradient-color),#0000_calc(50%+var(--spread)))]',
    'dark:[--base-color:#71717a] dark:[--base-gradient-color:#ffffff] dark:[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--base-gradient-color),#0000_calc(50%+var(--spread)))]',
    className,
  );

  const shimmerStyle = {
    '--spread': `${dynamicSpread}px`,
    backgroundImage: `var(--bg), linear-gradient(var(--base-color), var(--base-color))`,
    ...style,
  } as React.CSSProperties;

  // Plain element fallback when motion could not build a component type.
  if (MotionComponent === Component) {
    return (
      <Component className={shimmerClassName} style={shimmerStyle}>
        {children}
      </Component>
    );
  }

  const Animated = MotionComponent as typeof motion.span;

  return (
    <Animated
      className={shimmerClassName}
      initial={{ backgroundPosition: '100% center' }}
      animate={{ backgroundPosition: '0% center' }}
      transition={{
        repeat: Infinity,
        duration,
        ease: 'linear',
      }}
      style={shimmerStyle}
    >
      {children}
    </Animated>
  );
}

export const TextShimmer = React.memo(TextShimmerComponent);
