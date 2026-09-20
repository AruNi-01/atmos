"use client";

import React from "react";
import { useQueryStates } from "nuqs";
import { ptDesignParams } from "@/shared/lib/nuqs/searchParams";
import { PtDesignCenterPanel } from "./PtDesignCenterPanel";
import { PtDesignOverview } from "./PtDesignOverview";

export const PT_DESIGN_GLOBAL_CONTEXT_ID = "global";

/** Prototype Design launchpad: library overview, then a selected board. */
export function PtDesignStandaloneStage() {
  const [{ design }, setParams] = useQueryStates(ptDesignParams);

  if (!design) {
    return <PtDesignOverview />;
  }

  return (
    <PtDesignCenterPanel
      contextId={design}
      openMode="canvas"
      onBack={() => void setParams({ design: null })}
    />
  );
}
