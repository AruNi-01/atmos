"use client";

import { cn, getFileIconProps } from "@workspace/ui";

export function MdLivePathIcon({
  name,
  isDir,
  className,
}: {
  name: string;
  isDir: boolean;
  className?: string;
}) {
  const iconProps = getFileIconProps({
    name,
    isDir,
    className: cn("block size-4 max-h-4 max-w-4 shrink-0 object-contain", className),
  });
  return <img {...iconProps} alt="" width={16} height={16} />;
}
