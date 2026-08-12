import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { AuthSignInContent } from "@/features/onboarding/AuthSignInContent";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";
import { useMobileTheme } from "@/theme/theme-store";

export default function SignInRoute() {
  const router = useRouter();
  const theme = useMobileTheme();
  const { mode } = useLocalSearchParams<{ mode?: string }>();

  return (
    <>
      <AuthSignInContent
        initialScannerOpen={mode === "scan"}
        onAuthenticated={() => {
          if (router.canDismiss()) {
            router.dismiss();
            return;
          }
          router.replace("/");
        }}
        surface="sheet"
      />
      <Stack.Screen options={nativeLargeTitleOptions("Connect Atmos", theme.colors)} />
    </>
  );
}
