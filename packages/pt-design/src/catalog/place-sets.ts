import type { PtProps } from "../core/types";

/** Overlay types ship a closed trigger and the opened surface as separate instances. */
export const OVERLAY_PLACE_VARIANTS: Record<string, string[]> = {
  dialog: ["trigger", "open"],
  "alert-dialog": ["trigger", "open"],
  sheet: ["trigger", "open"],
  drawer: ["trigger", "open"],
  popover: ["trigger", "open"],
  "hover-card": ["trigger", "open"],
  tooltip: ["trigger", "open"],
  "dropdown-menu": ["trigger", "open"],
  "context-menu": ["trigger", "open"],
  menubar: ["bar", "open"],
  "navigation-menu": ["trigger", "open"],
  select: ["trigger", "open"],
  "native-select": ["trigger", "open"],
  combobox: ["trigger", "open"],
  "date-picker": ["trigger", "open"],
  command: ["trigger", "open"],
  accordion: ["collapsed", "expanded"],
  collapsible: ["collapsed", "expanded"],
};

/** Multi-look components drop every key variant when no variant is requested. */
export const SHOWCASE_PLACE_VARIANTS: Record<string, string[]> = {
  attachment: ["image", "image", "image", "uploading", "file"],
  bubble: ["received", "sent"],
  message: ["user", "assistant"],
  marker: ["status", "separator"],
  badge: ["default", "secondary", "outline", "destructive"],
};

const ATTACHMENT_IMAGES = [
  { label: "workspace.png", description: "PNG · 820 KB" },
  { label: "desk-reference.jpg", description: "JPG · 1.1 MB" },
  { label: "office-reference.jpg", description: "JPG · 940 KB" },
];

export function resolvePlaceVariants(componentType: string, requested?: string): string[] {
  if (requested) return [requested];
  return (
    OVERLAY_PLACE_VARIANTS[componentType] ??
    SHOWCASE_PLACE_VARIANTS[componentType] ??
    ["default"]
  );
}

function isGenericLabel(value: unknown, componentType: string): boolean {
  if (value === null || value === undefined || value === "") return true;
  const generic = componentType
    .split(/[-.]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return String(value) === generic;
}

export function showcaseProps(
  componentType: string,
  variant: string,
  index: number,
  base: PtProps,
): PtProps {
  if (componentType !== "attachment") return base;
  const generic = isGenericLabel(base.label, componentType);
  if (variant === "image") {
    const preset = ATTACHMENT_IMAGES[index] ?? ATTACHMENT_IMAGES[0]!;
    return {
      ...base,
      label: generic ? preset.label : String(base.label),
      description: generic ? preset.description : String(base.description ?? preset.description),
    };
  }
  if (variant === "uploading") {
    return {
      ...base,
      label: generic ? "sales-dashboard.pdf" : String(base.label),
      description: generic ? "Uploading · 64%" : String(base.description ?? "Uploading · 64%"),
    };
  }
  if (variant === "file") {
    return {
      ...base,
      label: generic ? "message-renderer.tsx" : String(base.label),
      description: generic ? "TypeScript · 12 KB" : String(base.description ?? "TypeScript · 12 KB"),
    };
  }
  return base;
}

export function nextPlaceOffset(
  componentType: string,
  index: number,
  placed: { x: number; y: number; width: number; height: number },
  origin: { x: number; y: number },
): { x: number; y: number } {
  if (componentType === "attachment") {
    if (index < 2) return { x: placed.x + placed.width + 12, y: origin.y };
    return { x: origin.x, y: placed.y + placed.height + 12 };
  }
  if (OVERLAY_PLACE_VARIANTS[componentType]) {
    return { x: placed.x + placed.width + 24, y: origin.y };
  }
  return { x: origin.x, y: placed.y + placed.height + 16 };
}
