/**
 * TextMorph (`packages/ui/src/components/ui/text-morph.tsx`) keys each
 * character by its letter and how many times that letter has already
 * appeared, then fades new and leaving characters on this spring.
 * Shared characters stay in the new order. They do not travel with a layout id.
 */
export const SCROLL_UNIT_SPRING = {
  damping: 18,
  mass: 0.3,
  stiffness: 280,
} as const;

export type TextMorphPhase = "enter" | "exit" | "stay";

export type TextMorphSlot = {
  id: string;
  label: string;
  phase: TextMorphPhase;
};

export function textMorphCharacters(text: string): { id: string; label: string }[] {
  const counts: Record<string, number> = {};
  return Array.from(text).map((char) => {
    const lower = char.toLowerCase();
    counts[lower] = (counts[lower] ?? 0) + 1;
    return {
      id: `${lower}${counts[lower]}`,
      label: char === " " ? "\u00A0" : char,
    };
  });
}

/** Current characters in order, with leaving characters inserted where they were. */
export function textMorphFrame(next: string, previous: string): TextMorphSlot[] {
  const current = textMorphCharacters(next);
  const prev = textMorphCharacters(previous);
  const currentIds = new Set(current.map((char) => char.id));
  const prevIds = new Set(prev.map((char) => char.id));
  const slots: TextMorphSlot[] = current.map((char) => ({
    ...char,
    phase: prevIds.has(char.id) ? "stay" : "enter",
  }));
  let insertAt = 0;
  for (const char of prev) {
    if (currentIds.has(char.id)) {
      const index = slots.findIndex(
        (slot, slotIndex) => slotIndex >= insertAt && slot.id === char.id,
      );
      insertAt = index === -1 ? slots.length : index + 1;
      continue;
    }
    slots.splice(insertAt, 0, { ...char, phase: "exit" });
    insertAt += 1;
  }
  return slots;
}
