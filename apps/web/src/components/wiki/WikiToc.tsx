"use client";

import React from "react";
import { useWikiContext } from "@/hooks/use-wiki-store";
import { MarkdownToc } from "@/components/markdown/MarkdownToc";

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
