import type { ComponentPropsWithoutRef } from "react";
import type { ExtraProps } from "streamdown";
import { cn } from "../../lib/utils";

type TableProps = ComponentPropsWithoutRef<"table"> & ExtraProps;
type HeaderCellProps = ComponentPropsWithoutRef<"th"> & ExtraProps;
type DataCellProps = ComponentPropsWithoutRef<"td"> & ExtraProps;

const cellWrapClassName = "min-w-0 align-top break-words whitespace-normal [overflow-wrap:anywhere]";

/** GFM tables in agent text/thinking: fill the message width, wrap cells, no chrome. */
export function StreamdownPlainTable({
  children,
  className,
  node: _node,
  ...props
}: TableProps) {
  return (
    <div className="my-4 w-full max-w-full overflow-hidden rounded-lg border border-border">
      <table
        className={cn("w-full table-fixed divide-y divide-border text-sm", className)}
        {...props}
      >
        {children}
      </table>
    </div>
  );
}

export function StreamdownPlainTh({
  children,
  className,
  node: _node,
  ...props
}: HeaderCellProps) {
  return (
    <th
      className={cn("px-4 py-2.5 text-left font-semibold text-sm", cellWrapClassName, className)}
      {...props}
    >
      {children}
    </th>
  );
}

export function StreamdownPlainTd({
  children,
  className,
  node: _node,
  ...props
}: DataCellProps) {
  return (
    <td className={cn("px-4 py-2.5 text-sm", cellWrapClassName, className)} {...props}>
      {children}
    </td>
  );
}

export const streamdownPlainTableComponents = {
  table: StreamdownPlainTable,
  th: StreamdownPlainTh,
  td: StreamdownPlainTd,
};
