"use client";

import React from "react";
import { useQueryStates } from "nuqs";
import { listPtDesignDocs } from "@atmos/pt-design/catalog";
import { ptDesignParams } from "@/shared/lib/nuqs/searchParams";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import { useProjects } from "@/features/project/hooks/use-project-bootstrap-query";
import { PtDesignCenterPanel } from "./PtDesignCenterPanel";
import { PtDesignOverview } from "./PtDesignOverview";
import { ptDesignOpenHref, resolvePtDesignList } from "./lib/pt-design-overview";

export const PT_DESIGN_GLOBAL_CONTEXT_ID = "global";

/** Prototype Design launchpad: library overview, then a selected board. */
export function PtDesignStandaloneStage() {
  const router = useAppRouter();
  const projects = useProjects();
  const [{ design }, setParams] = useQueryStates(ptDesignParams);

  const foreignHref = React.useMemo(() => {
    if (!design) return null;
    const item = resolvePtDesignList(listPtDesignDocs(), projects).find((row) => row.id === design);
    if (!item) return null;
    const href = ptDesignOpenHref(item, { kind: "global" });
    if (href && !href.startsWith("/pt-design")) return href;
    return null;
  }, [design, projects]);

  React.useEffect(() => {
    if (foreignHref) router.replace(foreignHref);
  }, [foreignHref, router]);

  if (!design || foreignHref) {
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
