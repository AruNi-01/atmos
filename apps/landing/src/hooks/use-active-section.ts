'use client'

import { useEffect, useState } from 'react'

import { usePathname } from 'next/navigation'

export const useActiveSection = (sectionIds: string[]) => {
  const [activeSection, setActiveSection] = useState<string>('')
  const pathname = usePathname()

  // Clear active section when navigating to a different page
  useEffect(() => {
    if (pathname !== '/') {
      setActiveSection('')
    }
  }, [pathname])

  // Scroll to hash on mount if present
  useEffect(() => {
    const hash = window.location.hash.slice(1) // Remove the '#'

    if (hash && sectionIds.includes(hash)) {
      const element = document.getElementById(hash)

      if (element) {
        // Small delay to ensure page is fully loaded
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 100)
      }
    }

    // Only run once on mount, not when sectionIds changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Run only once on mount

  useEffect(() => {
    // Only observe sections when on the home page
    if (pathname !== '/') return

    const observer = new IntersectionObserver(
      entries => {
        // Find all visible sections
        const visibleSections = entries
          .filter(entry => entry.isIntersecting)
          .sort((a, b) => {
            // Sort by how much of the section is visible (intersection ratio)
            // and by position on screen (top edge)
            const ratioComparison = b.intersectionRatio - a.intersectionRatio

            if (ratioComparison !== 0) return ratioComparison

            return a.boundingClientRect.top - b.boundingClientRect.top
          })

        // Set the most visible section as active
        if (visibleSections.length > 0) {
          setActiveSection(visibleSections[0].target.id)
        } else {
          // Clear active section when no sections are visible (e.g., scrolled past all sections into footer)
          setActiveSection('')
        }
      },
      {
        rootMargin: '-20% 0px -35% 0px', // Adjust when sections become "active"
        threshold: [0, 0.25, 0.5, 0.75, 1] // Multiple thresholds for better detection
      }
    )

    // Observe all sections
    sectionIds.forEach(id => {
      const element = document.getElementById(id)

      if (element) {
        observer.observe(element)
      }
    })

    return () => {
      observer.disconnect()
    }
  }, [sectionIds, pathname])

  return activeSection
}
