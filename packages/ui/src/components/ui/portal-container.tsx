"use client"

import * as React from "react"

/**
 * Optional portal mount for floating UI (APP-052).
 * - `undefined` context (no provider): Radix uses document body (web default).
 * - Provider with `container={null}`: still document body.
 * - Provider with `container={HTMLElement}`: portals into that node (desktop overlay root).
 */
const PortalContainerContext = React.createContext<HTMLElement | null | undefined>(
  undefined,
)

export function PortalContainerProvider({
  container,
  children,
}: {
  container: HTMLElement | null
  children: React.ReactNode
}) {
  return (
    <PortalContainerContext.Provider value={container}>
      {children}
    </PortalContainerContext.Provider>
  )
}

/** Resolve portal container: explicit prop wins, then context, else undefined (body). */
export function usePortalContainer(
  explicit?: HTMLElement | null,
): HTMLElement | undefined {
  const fromCtx = React.useContext(PortalContainerContext)
  if (explicit != null) return explicit
  if (fromCtx != null) return fromCtx
  return undefined
}
