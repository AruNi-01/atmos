import { Stack } from "expo-router";
import { ImportProjectScreen } from "@/features/projects/ImportProjectScreen";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";
import { useMobileTheme } from "@/theme/theme-store";

export default function ImportProjectRoute() {
  const theme = useMobileTheme();

  return (
    <>
      <ImportProjectScreen />
      <Stack.Screen options={nativeLargeTitleOptions("Import Project", theme.colors)} />
    </>
  );
}
