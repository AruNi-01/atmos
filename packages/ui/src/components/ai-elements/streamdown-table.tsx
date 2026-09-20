import type { ComponentPropsWithoutRef } from "react";
import type { ExtraProps } from "streamdown";
import { cn } from "../../lib/utils";
import {
  MARKDOWN_TABLE_CLASS,
  MARKDOWN_TABLE_HEAD_CLASS,
  MARKDOWN_TABLE_ROW_CLASS,
  MARKDOWN_TABLE_TD_CLASS,
  MARKDOWN_TABLE_TH_CLASS,
  MARKDOWN_TABLE_WRAP_CLASS,
} from "../../lib/markdown-table";

type TableProps = ComponentPropsWithoutRef<"table"> & ExtraProps;
type SectionProps = ComponentPropsWithoutRef<"thead"> & ExtraProps;
type RowProps = ComponentPropsWithoutRef<"tr"> & ExtraProps;
type HeaderCellProps = ComponentPropsWithoutRef<"th"> & ExtraProps;
type DataCellProps = ComponentPropsWithoutRef<"td"> & ExtraProps;

/** GFM tables in agent text/thinking: same chrome as MarkdownRenderer / Live. */
export function StreamdownPlainTable({
  children,
  className,
  node: _node,
  ...props
}: TableProps) {
  return (
    <div className={MARKDOWN_TABLE_WRAP_CLASS}>
      <table className={cn(className, MARKDOWN_TABLE_CLASS)} {...props}>
        {children}
      </table>
    </div>
  );
}

export function StreamdownPlainThead({
  children,
  className,
  node: _node,
  ...props
}: SectionProps) {
  return (
    <thead className={cn(className, MARKDOWN_TABLE_HEAD_CLASS)} {...props}>
      {children}
    </thead>
  );
}

export function StreamdownPlainTr({
  children,
  className,
  node: _node,
  ...props
}: RowProps) {
  return (
    <tr className={cn(className, MARKDOWN_TABLE_ROW_CLASS)} {...props}>
      {children}
    </tr>
  );
}

export function StreamdownPlainTh({
  children,
  className,
  node: _node,
  ...props
}: HeaderCellProps) {
  return (
    <th className={cn(className, MARKDOWN_TABLE_TH_CLASS)} {...props}>
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
    <td className={cn(className, MARKDOWN_TABLE_TD_CLASS)} {...props}>
      {children}
    </td>
  );
}

export function StreamdownPlainTbody({
  children,
  className: _className,
  node: _node,
  ...props
}: ComponentPropsWithoutRef<"tbody"> & ExtraProps) {
  return <tbody {...props}>{children}</tbody>;
}

export const streamdownPlainTableComponents = {
  table: StreamdownPlainTable,
  thead: StreamdownPlainThead,
  tbody: StreamdownPlainTbody,
  tr: StreamdownPlainTr,
  th: StreamdownPlainTh,
  td: StreamdownPlainTd,
};
