// Motion tokens for Morphing Tabs (from beui.dev, MIT).
// Springs drive tab glide / liquid surface; EASE_OUT for reduced-motion tweens.

export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/** Dragged handles and shared-layout glides — critically damped `useSpring`. */
export const SPRING_GLIDE = {
  stiffness: 700,
  damping: 50,
  mass: 0.5,
} as const;

export const SPRING_PRESS = {
  type: "spring",
  stiffness: 500,
  damping: 30,
  mass: 0.6,
} as const;
