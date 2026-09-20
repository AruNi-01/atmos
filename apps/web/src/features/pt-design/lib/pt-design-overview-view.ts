import { globalKey, readJson, writeJson } from "@/shared/lib/browser-store";

export type PtDesignOverviewView = "board" | "list";

const PT_DESIGN_OVERVIEW_VIEW_KEY = globalKey("pt-design-overview-view");

export function isPtDesignOverviewView(value: unknown): value is PtDesignOverviewView {
  return value === "board" || value === "list";
}

export function readPtDesignOverviewView(): PtDesignOverviewView {
  const stored = readJson<unknown>(PT_DESIGN_OVERVIEW_VIEW_KEY, "board");
  return isPtDesignOverviewView(stored) ? stored : "board";
}

export function writePtDesignOverviewView(value: PtDesignOverviewView): void {
  writeJson(PT_DESIGN_OVERVIEW_VIEW_KEY, value);
}
