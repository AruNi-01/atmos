'use client';

import React, { useEffect, type JSX } from 'react';
import { motion, type SpringOptions, useSpring, useTransform } from 'motion/react';
import { cn } from '../../lib/utils';

export type AnimatedNumberProps = {
  value: number;
  className?: string;
  locale?: Intl.LocalesArgument;
  springOptions?: SpringOptions;
  as?: React.ElementType;
};

export function AnimatedNumber({
  value,
  className,
  locale,
  springOptions,
  as = 'span',
}: AnimatedNumberProps) {
  const MotionComponent = motion.create(as as keyof JSX.IntrinsicElements);

  const spring = useSpring(value, springOptions);
  const display = useTransform(spring, (current) =>
    Math.round(current).toLocaleString(locale)
  );

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  return (
    <MotionComponent className={cn('tabular-nums', className)}>
      {display}
    </MotionComponent>
  );
}
