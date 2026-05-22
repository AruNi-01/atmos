"use client";

import React from "react";
import { getFileIconProps } from "@workspace/ui";

interface DiffFilePathLabelProps {
  path: string;
  className?: string;
  fileNameClassName?: string;
  dirPathClassName?: string;
}

export const DiffFilePathLabel: React.FC<DiffFilePathLabelProps> = ({
  path,
  className,
  fileNameClassName = "text-[13px] text-muted-foreground font-medium whitespace-nowrap shrink-0",
  dirPathClassName = "text-[11px] text-muted-foreground/40 whitespace-nowrap truncate min-w-0 flex-1 text-left",
}) => {
  const fileName = path.split("/").pop() || path;
  const parts = path.split("/");
  parts.pop();
  const dirPath = parts.join("/");
  const iconProps = getFileIconProps({
    name: fileName,
    isDir: false,
    className: "size-4 shrink-0",
  });

  return (
    <span className={className ? className : "flex min-w-0 items-center gap-2"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img {...iconProps} alt={`File: ${fileName}`} />
      <span className={fileNameClassName}>{fileName}</span>
      <span className={dirPathClassName} dir="rtl">
        <bdi>{dirPath ? `${dirPath}/` : ""}</bdi>
      </span>
    </span>
  );
};
