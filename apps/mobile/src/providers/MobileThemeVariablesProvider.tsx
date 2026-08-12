import type { PropsWithChildren } from "react";
import { useMemo } from "react";
import { VariableContextProvider } from "nativewind";
import { getMobileCssVariables } from "@/theme/css-variables";
import { useMobileTheme } from "@/theme/theme-store";

export function MobileThemeVariablesProvider({ children }: PropsWithChildren) {
  const theme = useMobileTheme();
  const variables = useMemo(() => getMobileCssVariables(theme.colorScheme), [theme.colorScheme]);

  return <VariableContextProvider value={variables}>{children}</VariableContextProvider>;
}
