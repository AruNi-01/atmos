import { colors } from "@/theme/colors";

export function nativeLargeTitleOptions(title: string) {
  return {
    title,
    headerLargeTitleEnabled: true,
    headerLargeTitleShadowVisible: false,
    headerTitleAlign: "center" as const,
    headerLargeTitleStyle: {
      color: colors.label,
      fontWeight: "800" as const,
    },
    headerTitleStyle: {
      color: colors.label,
      fontWeight: "700" as const,
    },
  };
}

export function nativeCompactTitleOptions(title: string) {
  return {
    title,
    headerLargeTitleEnabled: false,
    headerTransparent: false,
    headerStyle: { backgroundColor: colors.background },
    headerTitleAlign: "center" as const,
    headerTitleStyle: {
      color: colors.label,
      fontWeight: "700" as const,
    },
  };
}
