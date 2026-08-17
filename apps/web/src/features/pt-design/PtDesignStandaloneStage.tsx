"use client";

import React from "react";
import { PtDesignCenterPanel } from "./PtDesignCenterPanel";

export const PT_DESIGN_GLOBAL_CONTEXT_ID = "global";

/** Inner Prototype Design surface. Center-stage chrome is applied by the host. */
export function PtDesignStandaloneStage() {
  return <PtDesignCenterPanel contextId={PT_DESIGN_GLOBAL_CONTEXT_ID} />;
}
