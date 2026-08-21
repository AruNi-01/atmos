import { catalogDisplayName } from "./labels";
import { REQUIRED_BLOCKS, SHADCN_BASIC_IDS } from "./shadcn-list";
import { buildTemplate, stampRootMeta, type TemplateContext } from "./templates";
import { createInstanceId } from "../core/ids";
import { PT_ERROR_CODES, PtDesignError } from "../agent/errors";
import type { PtElement, PtProps, PtSize } from "../core/types";

const BUTTON_VARIANTS = ["default", "secondary", "outline", "ghost", "destructive", "link"];
const BADGE_VARIANTS = ["default", "secondary", "outline", "destructive"];
const OVERLAY_VARIANTS = ["trigger", "open"];

const VARIANT_MAP: Record<string, string[]> = {
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

const PROP_KEYS: Record<string, string[]> = {
  button: ["label"],
  badge: ["label"],
  input: ["placeholder"],
  textarea: ["placeholder"],
  label: ["label"],
  checkbox: ["label", "checked"],
  switch: ["label", "checked"],
  card: ["title", "description", "action"],
  alert: ["title", "description"],
  dialog: ["title", "description", "label"],
  "alert-dialog": ["title", "description", "label"],
  sheet: ["title", "description", "label"],
  drawer: ["title", "description", "label"],
  popover: ["title", "description", "label"],
  "hover-card": ["title", "description", "label"],
  tooltip: ["label"],
  avatar: ["fallback"],
  toggle: ["pressed"],
  attachment: ["label", "description"],
  bubble: ["label"],
  message: ["title", "description"],
  marker: ["label"],
  questionnaire: ["title", "description"],
};

export type CatalogEntry = {
  componentType: string;
  label: string;
  kind: "basic" | "block";
  variants: string[];
  propKeys: string[];
};

const ENTRIES: CatalogEntry[] = [
  ...SHADCN_BASIC_IDS.map((componentType) => ({
    componentType,
    label: catalogDisplayName(componentType),
    kind: "basic" as const,
    variants: VARIANT_MAP[componentType] ?? ["default"],
    propKeys: PROP_KEYS[componentType] ?? ["label", "title", "description"],
  })),
  ...REQUIRED_BLOCKS.map((componentType) => ({
    componentType,
    label: catalogDisplayName(componentType),
    kind: "block" as const,
    variants: ["default"],
    propKeys: ["title", "description"],
  })),
];

const BY_TYPE = new Map(ENTRIES.map((entry) => [entry.componentType, entry]));

export function listComponentTypes(kind?: CatalogEntry["kind"]): CatalogEntry[] {
  if (!kind) return ENTRIES.slice();
  return ENTRIES.filter((entry) => entry.kind === kind);
}

export function getCatalogEntry(componentType: string): CatalogEntry {
  const entry = BY_TYPE.get(componentType);
  if (!entry) {
    throw new PtDesignError(
      PT_ERROR_CODES.UNKNOWN_COMPONENT_TYPE,
      `Unknown componentType: ${componentType}`,
    );
  }
  return entry;
}

export function getComponentTemplate(
  componentType: string,
  ctx: TemplateContext & { instanceId?: string },
): { elements: PtElement[]; rootId: string; instanceId: string; width: number; height: number } {
  getCatalogEntry(componentType);
  const instanceId = ctx.instanceId ?? createInstanceId();
  const build = stampRootMeta(buildTemplate(componentType, ctx), {
    instanceId,
    componentType,
    variant: ctx.variant,
    size: ctx.size,
    props: ctx.props,
  });
  return { ...build, instanceId };
}

export function sanitizeProps(componentType: string, props: PtProps): PtProps {
  const entry = getCatalogEntry(componentType);
  const next: PtProps = {};
  for (const key of entry.propKeys) {
    if (key in props) next[key] = props[key] ?? null;
  }
  return next;
}

export function defaultProps(componentType: string): PtProps {
  const entry = getCatalogEntry(componentType);
  const props: PtProps = {};
  for (const key of entry.propKeys) {
    if (key === "checked" || key === "pressed") props[key] = false;
    else if (key === "placeholder") props[key] = "Placeholder";
    else if (key === "label") props[key] = titleCase(componentType);
    else if (key === "title") props[key] = titleCase(componentType);
    else if (key === "description") props[key] = "Description";
    else if (key === "action") props[key] = "Action";
    else if (key === "fallback") props[key] = "PT";
    else props[key] = null;
  }
  return props;
}

function titleCase(id: string): string {
  return id
    .split(/[-.]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function allowedSize(size?: PtSize): PtSize | undefined {
  return size;
}
