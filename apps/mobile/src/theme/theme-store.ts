import { useMemo } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { getMobileThemeColors } from "@/theme/colors";
import {
  resolveMobileThemePreference,
  themePreferenceOptions,
  type MobileThemePreference,
} from "@/theme/theme-preference";

type ThemeState = {
  preference: MobileThemePreference;
  setPreference: (preference: MobileThemePreference) => void;
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      preference: "system",
      setPreference: (preference) => set({ preference }),
    }),
    {
      name: "atmos.mobile.theme",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

export { resolveMobileThemePreference, themePreferenceOptions, type MobileThemePreference };

export function useMobileTheme() {
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);
  const systemColorScheme = useColorScheme();
  const colorScheme = resolveMobileThemePreference(preference, systemColorScheme);
  const colors = getMobileThemeColors(colorScheme);

  return useMemo(
    () => ({
      colorScheme,
      colors,
      isDark: colorScheme === "dark",
      preference,
      setPreference,
      statusBarStyle: colorScheme === "dark" ? "light" as const : "dark" as const,
      systemColorScheme,
    }),
    [colorScheme, colors, preference, setPreference, systemColorScheme],
  );
}
