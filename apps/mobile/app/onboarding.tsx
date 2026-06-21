import { Stack } from "expo-router";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";
import { useMobileTheme } from "@/theme/theme-store";

export default function OnboardingRoute() {
  const theme = useMobileTheme();

  return (
    <>
      <OnboardingScreen />
      <Stack.Screen options={nativeLargeTitleOptions("Connect Atmos", theme.colors)} />
    </>
  );
}
