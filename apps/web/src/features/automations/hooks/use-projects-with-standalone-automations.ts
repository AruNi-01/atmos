"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { useAutomationListQuery } from "@/features/automations/hooks/use-automations-query";
import { mergeStandaloneAutomationProject } from "@/features/automations/lib/standalone-sidebar";
import { useProjects } from "@/features/project/hooks/use-project-bootstrap-query";

export function useProjectsWithStandaloneAutomations() {
  const projects = useProjects();
  const automationsQuery = useAutomationListQuery();
  const t = useTranslations("automation.sidebar");
  return React.useMemo(
    () =>
      mergeStandaloneAutomationProject(
        projects,
        automationsQuery.data?.automations ?? [],
        t("standaloneGroup"),
      ),
    [automationsQuery.data?.automations, projects, t],
  );
}
