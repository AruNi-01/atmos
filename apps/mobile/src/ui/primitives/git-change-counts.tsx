import { Fragment } from "react";
import { Text } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";

export function positiveDiffCount(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return Math.trunc(value);
}

/** Green additions and red deletions, matching the web diff counts. */
export function GitChangeCounts({
  additions,
  deletions,
}: {
  additions?: number | null;
  deletions?: number | null;
}) {
  const theme = useMobileTheme();
  const added = positiveDiffCount(additions);
  const removed = positiveDiffCount(deletions);
  if (added === 0 && removed === 0) return null;
  return (
    <Text>
      {added > 0 ? <Text style={{ color: theme.colors.green }}>+{added}</Text> : null}
      {added > 0 && removed > 0 ? " " : null}
      {removed > 0 ? <Text style={{ color: theme.colors.red }}>-{removed}</Text> : null}
    </Text>
  );
}

/** Branch or place label, then the colored diff counts when either side is positive. */
export function GitMetaLine({
  additions,
  deletions,
  label,
}: {
  additions?: number | null;
  deletions?: number | null;
  label: string;
}) {
  const added = positiveDiffCount(additions);
  const removed = positiveDiffCount(deletions);
  if (added === 0 && removed === 0) return label;
  return (
    <Fragment>
      {label}
      {" · "}
      <GitChangeCounts additions={added} deletions={removed} />
    </Fragment>
  );
}
