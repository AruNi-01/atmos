"use client";

import React from "react";
import { useQueryState } from "nuqs";
import { listPtDesignDocs, designListedInHost } from "@atmos/pt-design/catalog";
import { ptDesignParams } from "@/shared/lib/nuqs/searchParams";
import { useContextParams } from "@/shared/hooks/use-context-params";
import { PtDesignCenterPanel } from "./PtDesignCenterPanel";
import { PtDesignOverview } from "./PtDesignOverview";
import type { PtDesignHostContext } from "./lib/pt-design-overview";

/** Project / workspace Prototype Design tab: overview of this context, then a selected board. */
export function PtDesignHostStage({ contextId }: { contextId: string }) {
  const { workspaceId, projectId } = useContextParams();
  const [design, setDesign] = useQueryState("design", ptDesignParams.design);
  const host = React.useMemo<PtDesignHostContext>(() => {
    if (workspaceId) return { kind: "workspace", workspaceId };
    return { kind: "project", projectId: projectId ?? contextId };
  }, [contextId, projectId, workspaceId]);

  const allowed = React.useMemo(() => {
    if (!design) return false;
    const row = listPtDesignDocs().find((item) => item.id === design);
    if (!row) return false;
    return designListedInHost(row.meta, host);
  }, [design, host]);

  React.useEffect(() => {
    if (design && !allowed) void setDesign(null);
  }, [allowed, design, setDesign]);

  if (!design || !allowed) {
    return <PtDesignOverview host={host} />;
  }

  return (
    <PtDesignCenterPanel
      contextId={design}
      openMode="center-tab"
      onBack={() => void setDesign(null)}
    />
  );
}
