"use client";

import React from "react";
import { useQueryState } from "nuqs";
import { ptDesignParams } from "@/shared/lib/nuqs/searchParams";
import { PtDesignCenterPanel } from "./PtDesignCenterPanel";
import { PtDesignOverview } from "./PtDesignOverview";
import { ptDesignHostForFrame, type PtDesignHostContext } from "./lib/pt-design-overview";

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
  const [design, setDesign] = useQueryState("design", ptDesignParams.design);
  const resolvedHost = React.useMemo(
    () => host ?? ptDesignHostForFrame(contextId, isProject),
    [contextId, host, isProject],
  );

  if (!active || !design) {
    return <PtDesignOverview host={resolvedHost} />;
  }

  return (
    <PtDesignCenterPanel
      contextId={design}
      openMode="center-tab"
      onBack={() => void setDesign(null)}
    />
  );
}
