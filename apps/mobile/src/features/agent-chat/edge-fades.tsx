import { StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useMobileTheme } from "@/theme/theme-store";

const EDGE_FADE_PX = 24;

export function EdgeFades() {
  const theme = useMobileTheme();
  const background = theme.colors.background;
  return (
    <>
      <LinearGradient
        colors={[background, "transparent"]}
        end={{ x: 0, y: 1 }}
        pointerEvents="none"
        start={{ x: 0, y: 0 }}
        style={styles.top}
      />
      <LinearGradient
        colors={["transparent", background]}
        end={{ x: 0, y: 1 }}
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
    height: EDGE_FADE_PX,
    left: 0,
    position: "absolute",
    right: 0,
  },
  top: {
    height: EDGE_FADE_PX,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
});
