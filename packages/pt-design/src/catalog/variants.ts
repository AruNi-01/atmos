const BUTTON_VARIANTS = ["default", "secondary", "outline", "ghost", "destructive", "link"];
const BADGE_VARIANTS = ["default", "secondary", "outline", "destructive"];
const OVERLAY_VARIANTS = ["trigger", "open"];

/** Meaningful second-level catalog variants. `default`-only types stay a single insert. */
export const CATALOG_VARIANT_MAP: Readonly<Record<string, readonly string[]>> = {
  button: BUTTON_VARIANTS,
  badge: BADGE_VARIANTS,
  alert: ["default", "destructive"],
  toggle: ["default", "outline"],
  dialog: OVERLAY_VARIANTS,
  "alert-dialog": OVERLAY_VARIANTS,
  sheet: OVERLAY_VARIANTS,
  drawer: OVERLAY_VARIANTS,
  popover: OVERLAY_VARIANTS,
  "hover-card": OVERLAY_VARIANTS,
  tooltip: OVERLAY_VARIANTS,
  "dropdown-menu": OVERLAY_VARIANTS,
  "context-menu": OVERLAY_VARIANTS,
  menubar: ["bar", "open"],
  "navigation-menu": OVERLAY_VARIANTS,
  select: OVERLAY_VARIANTS,
  "native-select": OVERLAY_VARIANTS,
  combobox: OVERLAY_VARIANTS,
  "date-picker": OVERLAY_VARIANTS,
  command: OVERLAY_VARIANTS,
  accordion: ["collapsed", "expanded"],
  collapsible: ["collapsed", "expanded"],
  attachment: ["image", "uploading", "file"],
  bubble: ["received", "sent"],
  message: ["user", "assistant"],
  marker: ["status", "separator"],
};

export function catalogVariantsFor(type: string): readonly string[] {
  const variants = CATALOG_VARIANT_MAP[type] ?? [];
  const meaningful = variants.filter((variant) => variant !== "default");
  if (meaningful.length === 0) return [];
  return variants;
}
