import { CHART_IDS } from "../catalog/chart-list";
import { REQUIRED_BLOCKS, SHADCN_BASIC_IDS } from "../catalog/shadcn-list";
import type { PtNodeType } from "./schema";

const FROZEN_IDS: readonly PtNodeType[] = [...SHADCN_BASIC_IDS, ...REQUIRED_BLOCKS, ...CHART_IDS];
const ID_SET = new Set<string>(FROZEN_IDS);

export function catalogIdToXmlTag(id: PtNodeType): string {
  return id.replaceAll(".", "-");
}

const TAG_TO_ID = new Map<string, PtNodeType>();

for (const id of FROZEN_IDS) {
  const tag = catalogIdToXmlTag(id);
  const existing = TAG_TO_ID.get(tag);
  if (existing !== undefined && existing !== id) {
    throw new Error(`Catalog XML tag collision: "${tag}" (${existing} vs ${id})`);
  }
  TAG_TO_ID.set(tag, id);
}

export function xmlTagToCatalogId(tag: string): PtNodeType | null {
  return TAG_TO_ID.get(tag) ?? null;
}

export function isPtNodeType(value: string): value is PtNodeType {
  return ID_SET.has(value);
}
