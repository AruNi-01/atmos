import { Text, View } from "react-native";

const PRIORITY_COLOR: Record<string, string> = {
  high: "#f97316",
  low: "#22c55e",
  medium: "#eab308",
  urgent: "#ef4444",
};

/** Same marks as the web priority menu: lines, bars, or an urgent badge. */
export function WorkspacePriorityIcon({
  mutedColor,
  priority,
  size = 16,
}: {
  mutedColor: string;
  priority: string;
  size?: number;
}) {
  if (priority === "urgent") {
    return (
      <View
        style={{
          alignItems: "center",
          backgroundColor: PRIORITY_COLOR.urgent,
          borderRadius: 3,
          height: size,
          justifyContent: "center",
          width: size,
        }}
      >
        <Text style={{ color: "#ffffff", fontSize: size * 0.7, fontWeight: "700", lineHeight: size }}>
          !
        </Text>
      </View>
    );
  }

  if (priority === "high" || priority === "medium" || priority === "low") {
    const activeBars = priority === "high" ? 3 : priority === "medium" ? 2 : 1;
    const color = PRIORITY_COLOR[priority];
    return (
      <View style={{ alignItems: "flex-end", flexDirection: "row", gap: 2, height: size, width: size }}>
        {[1, 2, 3].map((bar) => (
          <View
            key={bar}
            style={{
              backgroundColor: color,
              borderRadius: 1,
              height: bar === 1 ? size * 0.4 : bar === 2 ? size * 0.7 : size,
              opacity: bar > activeBars ? 0.3 : 1,
              width: 3,
            }}
          />
        ))}
      </View>
    );
  }

  return (
    <View style={{ alignItems: "center", gap: 3, height: size, justifyContent: "center", width: size }}>
      {[0, 1, 2].map((line) => (
        <View
          key={line}
          style={{ backgroundColor: mutedColor, borderRadius: 1, height: 1.5, width: size * 0.75 }}
        />
      ))}
    </View>
  );
}
