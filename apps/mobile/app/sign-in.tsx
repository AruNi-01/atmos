import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { LoginSheet } from "@/features/onboarding/LoginSheet";
import { useMobileTheme } from "@/theme/theme-store";

export default function SignInRoute() {
  const router = useRouter();
  const theme = useMobileTheme();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  // Match AuthConnectContent dock: light uses near-black fill, dark uses elevated card.
  const fillColor = theme.isDark ? theme.colors.cardElevated : "#0a0a0b";

  const close = () => {
    if (router.canDismiss()) {
      router.dismiss();
      return;
    }
    router.replace("/");
  };

  return (
    <View style={[styles.fill, { backgroundColor: fillColor }]}>
      <Stack.Screen
        options={{
          title: "",
          headerShown: false,
          headerTitle: "",
          contentStyle: {
            backgroundColor: fillColor,
            flex: 1,
          },
        }}
      />
      <LoginSheet
        initialScannerOpen={mode === "scan"}
        onAuthenticated={close}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
