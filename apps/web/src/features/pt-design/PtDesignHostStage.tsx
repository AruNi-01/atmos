"use client";

import React from "react";
import { PtDesignCenterPanel } from "./PtDesignCenterPanel";
import { PtDesignOverview } from "./PtDesignOverview";
import { ptDesignHostForFrame, type PtDesignHostContext } from "./lib/pt-design-overview";
import { usePtDesignRememberedDesign } from "./lib/use-pt-design-remembered-design";

/** Project / workspace Prototype Design tab: shared library, then a selected board. */
export function PtDesignHostStage({
  contextId,
  host,
  active = true,
  isProject = false,
}: {
  contextId: string;
  host?: PtDesignHostContext;
  active?: boolean;
  isProject?: boolean;
}) {
  const remembered = usePtDesignRememberedDesign(contextId, active);
  const design = remembered.design;
  const resolvedHost = React.useMemo(
    () => host ?? ptDesignHostForFrame(contextId, isProject),
    [contextId, host, isProject],
  );

  if (active && !remembered.ready) return null;
  if (!active || !design) {
    return <PtDesignOverview host={resolvedHost} />;
  }

  return (
    <PtDesignCenterPanel
      contextId={design}
      openMode="center-tab"
      onBack={remembered.closeDesign}
    />
  );
}
