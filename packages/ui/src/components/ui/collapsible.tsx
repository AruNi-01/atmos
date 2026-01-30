"use client"

import * as React from "react"
import { cn } from "../../lib/utils"

interface CollapsibleProps extends React.HTMLAttributes<HTMLDivElement> {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  disabled?: boolean
}

const CollapsibleContext = React.createContext<{
  open: boolean
  onOpenChange: (open: boolean) => void
  disabled?: boolean
} | null>(null)

const Collapsible = React.forwardRef<HTMLDivElement, CollapsibleProps>(
  ({ open: openProp, defaultOpen, onOpenChange, disabled, className, children, ...props }, ref) => {
    const [openState, setOpenState] = React.useState(defaultOpen ?? false)

    const open = openProp ?? openState

    const handleOpenChange = React.useCallback(
      (value: boolean) => {
        if (openProp === undefined) {
          setOpenState(value)
        }
        onOpenChange?.(value)
      },
      [openProp, onOpenChange]
    )

    return (
      <CollapsibleContext.Provider value={{ open, onOpenChange: handleOpenChange, disabled }}>
        <div
          ref={ref}
          data-state={open ? "open" : "closed"}
          className={cn(className)}
          {...props}
        >
          {children}
        </div>
      </CollapsibleContext.Provider>
    )
  }
)
Collapsible.displayName = "Collapsible"

const CollapsibleTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, children, onClick, ...props }, ref) => {
  const context = React.useContext(CollapsibleContext)

  return (
    <button
      ref={ref}
      type="button"
      onClick={(e) => {
        if (!context?.disabled) {
          context?.onOpenChange(!context.open)
          onClick?.(e)
        }
      }}
      data-state={context?.open ? "open" : "closed"}
      disabled={context?.disabled}
      className={cn("group", className)}
      {...props}
    >
      {children}
    </button>
  )
})
CollapsibleTrigger.displayName = "CollapsibleTrigger"

const CollapsibleContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const context = React.useContext(CollapsibleContext)

  return (
    <div
      ref={ref}
      data-state={context?.open ? "open" : "closed"}
      className={cn(
        "grid transition-[grid-template-rows] duration-200 ease-out",
        context?.open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        className
      )}
      {...props}
    >
      <div className="overflow-hidden">
        {children}
      </div>
    </div>
  )
})
CollapsibleContent.displayName = "CollapsibleContent"

const CollapsiblePanel = CollapsibleContent

export { Collapsible, CollapsibleTrigger, CollapsibleContent, CollapsiblePanel }
