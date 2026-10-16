import { StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useMobileTheme } from "@/theme/theme-store";
import { AGENT_CHAT_EDGE_FADE_PX, agentChatEdgeFadeGradient } from "./edge-fade-stops";

/** Top fade stays off until the transcript leaves the top, matching web. */
export function EdgeFades({ topActive }: { topActive: boolean }) {
  const theme = useMobileTheme();
  const background = theme.colors.background;
  const top = agentChatEdgeFadeGradient(background, "top");
  const bottom = agentChatEdgeFadeGradient(background, "bottom");
  return (
    <>
      {topActive ? (
        <LinearGradient
          colors={top.colors}
          end={{ x: 0, y: 1 }}
          locations={top.locations}
          pointerEvents="none"
          start={{ x: 0, y: 0 }}
          style={styles.top}
        />
      ) : null}
      <LinearGradient
        colors={bottom.colors}
        end={{ x: 0, y: 1 }}
        locations={bottom.locations}
        pointerEvents="none"
        start={{ x: 0, y: 0 }}
        style={styles.bottom}
      />
    </>
  );
}

const styles = StyleSheet.create({
  bottom: {
    bottom: 0,
    height: AGENT_CHAT_EDGE_FADE_PX,
    left: 0,
    position: "absolute",
    right: 0,
  },
  top: {
    height: AGENT_CHAT_EDGE_FADE_PX,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
});
