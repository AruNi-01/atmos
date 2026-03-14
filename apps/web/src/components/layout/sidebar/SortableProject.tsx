"use client";

import React from "react";
import { useSortable, CSS } from "@workspace/ui";
import type { ProjectItemProps } from "./ProjectItem";
import { ProjectItem } from "./ProjectItem";

export type SortableProjectProps = Omit<ProjectItemProps, "isDragging" | "isPlaceholder" | "attributes" | "listeners">;

export const SortableProject: React.FC<SortableProjectProps> = (props) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.project.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <ProjectItem
        {...props}
        isPlaceholder={isDragging}
        attributes={attributes}
        listeners={listeners}
      />
    </div>
  );
};
