# UI Component Library - AGENTS.md

> **🎁 @workspace/ui**: The unified design system for Vibe Habitat.

## Structure
- **UI (src/components/ui/)**: Atomic shadcn components.
- **Coss (src/components/coss/)**: Custom style-focused components.
- **Animate (src/components/animate/)**: Motion and animation primitives.

## Working Patterns
- **Tailwind v4**: Uses pure CSS theme tokens in `src/styles/globals.css`.
- **Pure Components**: UI components should not have side effects or direct API calls.

## Complex Interactions
- **Smooth Nested DnD**: When implementing nested sortable lists, prioritize stability using `DragOverlay` and child isolation. 
  - *Implementation Guide*: `docs/frontend_impl_eg/smooth-nested-dnd.md`
