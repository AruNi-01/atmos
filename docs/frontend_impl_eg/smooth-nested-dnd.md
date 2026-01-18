# Implement Smooth Nested Drag-and-Drop with dnd-kit

This document outlines the patterns used to achieve high-performance, "buttery smooth" drag-and-drop interactions in a nested structure (e.g., Projects containing Workspaces).

## 1. Core Concepts

Achieving smoothness requires moving beyond basic implementation by addressing common bottlenecks:
- **Collision Ambiguity**: When a parent item is dragged, its children's sorting contexts can interfere.
- **Layout Thrashing**: Sorting items inside a moving container causes jitter.
- **Z-Index Issues**: Elements moving underneath others during drag.

## 2. Progressive Implementation Steps

### Phase 1: Stability & Constraint
Focus on making the drag predictable.
- **Sensors**: Use `MouseSensor` and `PointerSensor` with an `activationConstraint` (e.g., `distance: 5px`) to distinguish clicks from drags.
- **Modifiers**: Use `restrictToVerticalAxis` and `restrictToWindowEdges` to lock motion and prevent items from flying out of view.

### Phase 2: Structural Isolation (Drag Overlay)
The key to smoothness in nested lists.
- **DragOverlay**: Extract the active item from the DOM tree and move it to a top-level `DragOverlay`.
- **Placeholder Management**: While an item is in the overlay, leave a "ghost" placeholder in the list. For nested parents, hide their children (`max-h-0`) during drag to normalize the "collision box" to just the header.

### Phase 3: Conflict Resolution
Prevent child contexts from stealing focus from the parent.
- **Pointer Events**: Disable `pointer-events` on child list containers when a parent is being dragged.
- **Collision Strategy**: Use `closestCenter` or properly tuned algorithms to ensure the "drop zone" is calculated against the simplified placeholder.

## 3. Best Practices Recap

| Technique | Problem Solved |
| :--- | :--- |
| **DragOverlay** | Jittery movement and z-index overlap. |
| **Collapsing Children** | Collision detection confusion in nested lists. |
| **Custom Transition** | Making snap-back and reordering feel natural. |
| **Pointer-Events: None** | Children "fighting" with parent drag intent. |

---

*Refer to `apps/web/src/components/layout/LeftSidebar.tsx` for the reference implementation.*
