import type { PropsWithChildren } from "react";
import { useEffect, useMemo } from "react";
import { View } from "react-native";
import { VariableContextProvider, vars } from "nativewind";
import { colorScheme as cssColorScheme } from "react-native-css";
import { getMobileCssVariables } from "@/theme/css-variables";
import { useMobileTheme } from "@/theme/theme-store";

export function MobileThemeVariablesProvider({ children }: PropsWithChildren) {
  const theme = useMobileTheme();
  const variables = useMemo(
    () => getMobileCssVariables(theme.colorScheme),
    [theme.colorScheme],
  );
  // Inline style vars as a belt-and-suspenders path for components that still
  // read CSS custom properties via NativeWind className.
  const varStyle = useMemo(() => vars(variables), [variables]);

  useEffect(() => {
    // Keep react-native-css color scheme in sync with the app preference so any
    // appearance-driven styles track Dark/Light/System.
    cssColorScheme.set(theme.colorScheme);
  }, [theme.colorScheme]);

  return (
    <VariableContextProvider value={variables}>
      <View style={[{ flex: 1 }, varStyle]}>{children}</View>
    </VariableContextProvider>
  );
}
