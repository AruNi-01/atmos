import { StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useMobileTheme } from "@/theme/theme-store";

const EDGE_FADE_PX = 24;

/** `transparent` is rgba(0,0,0,0), which fades light backgrounds through gray. */
function clearStop(background: string): string {
  if (background.startsWith("#") && background.length === 7) {
    const red = Number.parseInt(background.slice(1, 3), 16);
    const green = Number.parseInt(background.slice(3, 5), 16);
    const blue = Number.parseInt(background.slice(5, 7), 16);
    return `rgba(${red}, ${green}, ${blue}, 0)`;
  }
  return background;
}

/** Top fade stays off until the transcript leaves the top, matching web. */
export function EdgeFades({ topActive }: { topActive: boolean }) {
  const theme = useMobileTheme();
  const background = theme.colors.background;
  const clear = clearStop(background);
  return (
    <>
      {topActive ? (
        <LinearGradient
          colors={[background, clear]}
          end={{ x: 0, y: 1 }}
          pointerEvents="none"
          start={{ x: 0, y: 0 }}
          style={styles.top}
        />
      ) : null}
      <LinearGradient
        colors={[clear, background]}
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
