import { Stack } from "expo-router";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";

export default function OnboardingRoute() {
  return (
    <>
      <OnboardingScreen />
      <Stack.Screen options={nativeLargeTitleOptions("Connect Atmos")} />
    </>
  );
}
