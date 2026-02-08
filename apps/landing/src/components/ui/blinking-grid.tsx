'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'

interface BlinkingGridProps extends React.HTMLAttributes<HTMLDivElement> {
  gridSize?: number
  dotColor?: string
}

export const BlinkingGrid = ({
  className,
  gridSize = 18,
  dotColor = 'bg-primary',
  ...props
}: BlinkingGridProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dots, setDots] = useState<{ x: number; y: number; delay: number }[]>([])

  // Update dots on mount and resize
  useEffect(() => {
    const updateDots = () => {
      if (!containerRef.current) return

      const { width, height } = containerRef.current.getBoundingClientRect()

      // Calculate max columns and rows
      const cols = Math.floor(width / gridSize)
      const rows = Math.floor(height / gridSize)

      const newDots: { x: number; y: number; delay: number }[] = []

      // Select approximately 10-15 random dots based on area
      const count = Math.floor((cols * rows) * 0.05) // 5% density, maybe too high? Let's cap it or use fixed number.
      // Let's use a fixed density but cap at max 20 for performance and subtlety.
      const numDots = Math.min(25, Math.max(5, count))

      const used = new Set<string>()

      for (let i = 0; i < numDots; i++) {
        // Randomly pick a grid cell
        const c = Math.floor(Math.random() * cols)
        const r = Math.floor(Math.random() * rows)

        const key = `${c}-${r}`
        if (used.has(key)) continue
        used.add(key)

        // Calculate center position (9px offset for 18px grid)
        const x = c * gridSize + (gridSize / 2)
        const y = r * gridSize + (gridSize / 2)

        newDots.push({
          x,
          y,
          delay: Math.random() * 5 // Random delay up to 5s
        })
      }

      setDots(newDots)
    }

    updateDots()

    // Add resize listener
    const observer = new ResizeObserver(updateDots)
    if (containerRef.current) observer.observe(containerRef.current)

    return () => observer.disconnect()
  }, [gridSize])

  return (
    <div
      ref={containerRef}
      className={cn('relative', className)}
      {...props}
    >
      {/* Blinking dots overlay */}
      {dots.map((dot, i) => (
        <motion.div
          key={i}
          className={cn('absolute pointer-events-none rounded-full w-[3px] h-[3px] shadow-[0_0_4px_var(--primary)]', dotColor)}
          style={{
            left: `${dot.x}px`,
            top: `${dot.y}px`,
            transform: 'translate(-50%, -50%)',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{
            duration: 2,
            repeat: Infinity,
            delay: dot.delay,
            ease: 'easeInOut'
          }}
        />
      ))}
    </div>
  )
}
