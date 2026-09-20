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
    // Rest-state translate3d(0,0,0) would become a sticky containing block
    // and pin project titles to the card instead of the list scrollport.
    transform:
      transform && (transform.x !== 0 || transform.y !== 0)
        ? CSS.Translate.toString(transform)
        : undefined,
    transition,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <ProjectItem
        {...props}
        stickyHeader={!props.hideWorkspaceList}
        isPlaceholder={isDragging}
        attributes={attributes}
        listeners={listeners}
      />
    </div>
  );
};
