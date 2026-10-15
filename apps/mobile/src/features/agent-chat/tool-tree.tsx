import {
  TREE_BRANCH_FIRST_START_Y,
  TREE_BRANCH_GUTTER,
  TREE_BRANCH_MID_Y,
  TREE_BRANCH_RADIUS,
  TREE_LINE_ALPHA,
  TREE_LINE_WIDTH,
  treeReachPath,
  treeTrunkPath,
} from "@atmos/agent-transcript/agent-tree-branch";

export { TREE_BRANCH_GUTTER, TREE_LINE_ALPHA, TREE_LINE_WIDTH };

/** Fully drawn elbow plus the trunk that continues into the next row. */
export function toolTreeStrokes(input: { first: boolean; last: boolean; height: number }): {
  reach: string;
  trunk: string | null;
} {
  const reach = treeReachPath(input.first ? TREE_BRANCH_FIRST_START_Y : 0, TREE_BRANCH_MID_Y);
  const trunk =
    input.last || input.height <= 0
      ? null
      : treeTrunkPath(TREE_BRANCH_MID_Y - TREE_BRANCH_RADIUS, input.height);
  return { reach, trunk };
}

// @view

import { useState, type ReactNode } from "react";
import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useMobileTheme } from "@/theme/theme-store";
import { ChevronRightIcon } from "@/ui/icons/lucide-native";

export function ExpandChevron({ color, open }: { color?: string; open: boolean }) {
  const theme = useMobileTheme();
  return (
    <View style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }}>
      <ChevronRightIcon color={color ?? theme.colors.secondaryLabel} size={12} strokeWidth={2.2} />
    </View>
  );
}

export function ToolTreeRow({
  children,
  first,
  last,
}: {
  children: ReactNode;
  first: boolean;
  last: boolean;
}) {
  const theme = useMobileTheme();
  const [height, setHeight] = useState(0);
  const strokes = toolTreeStrokes({ first, last, height });
  return (
    <View style={{ flexDirection: "row", minHeight: 24 }}>
      <View pointerEvents="none" style={{ width: TREE_BRANCH_GUTTER }}>
        {height > 0 ? (
          <Svg
            height={height}
            width={TREE_BRANCH_GUTTER}
            style={{ left: 0, position: "absolute", top: 0 }}
          >
            {strokes.trunk ? (
              <Path
                d={strokes.trunk}
                fill="none"
                stroke={theme.colors.label}
                strokeLinecap="butt"
                strokeLinejoin="round"
                strokeOpacity={TREE_LINE_ALPHA}
                strokeWidth={TREE_LINE_WIDTH}
              />
            ) : null}
            <Path
              d={strokes.reach}
              fill="none"
              stroke={theme.colors.label}
              strokeLinecap="butt"
              strokeLinejoin="round"
              strokeOpacity={TREE_LINE_ALPHA}
              strokeWidth={TREE_LINE_WIDTH}
            />
          </Svg>
        ) : null}
      </View>
      <View
        onLayout={(event) => {
          const next = event.nativeEvent.layout.height;
          setHeight((current) => (current === next ? current : next));
        }}
        style={{ flex: 1, minWidth: 0 }}
      >
        {children}
      </View>
    </View>
  );
}
