"use client";

import { PtDesignCenterPanel } from "./PtDesignCenterPanel";
import { PtDesignOverview } from "./PtDesignOverview";
import { usePtDesignRememberedDesign } from "./lib/use-pt-design-remembered-design";

export const PT_DESIGN_GLOBAL_CONTEXT_ID = "global";

/** Prototype Design launchpad: library overview, then a selected board. */
export function PtDesignStandaloneStage() {
  const { design, ready, closeDesign } = usePtDesignRememberedDesign(PT_DESIGN_GLOBAL_CONTEXT_ID);

  if (!ready) return null;
  if (!design) {
    return <PtDesignOverview />;
  }

  return (
    <PtDesignCenterPanel
      contextId={design}
      openMode="canvas"
      onBack={closeDesign}
    />
  );
}
