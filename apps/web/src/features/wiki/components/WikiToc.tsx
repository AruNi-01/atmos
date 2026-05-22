"use client";

import React from "react";
import { useWikiContext } from "@/features/wiki/store/use-wiki-store";
import { MarkdownToc } from "@/shared/components/markdown/MarkdownToc";

interface WikiTocProps {
  contextId: string;
}

export const WikiToc: React.FC<WikiTocProps> = ({ contextId }) => {
  const { activeContent } = useWikiContext(contextId);

  if (!activeContent) return null;

  return (
    <MarkdownToc
      markdown={activeContent}
      scrollContainerId="wiki-content-root"
    />
  );
};
