import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { ComputerList } from "@/features/computers/ComputerPicker";
import { useMobileSettingsController } from "@/features/settings/use-mobile-settings-controller";
import { useMobileTheme } from "@/theme/theme-store";
import { AppScreen, EmptyState, InlineError, Section } from "@/ui/layout/app-screen";
import { RefreshIcon } from "@/ui/icons/lucide-native";
import { GlassActionButtons } from "@/ui/primitives/glass-action-buttons";
import { ListSkeleton } from "@/ui/primitives/list-skeleton";

function RefreshComputersButton({ tintColor }: { tintColor: string }) {
  const settings = useMobileSettingsController();
  const fetching = settings.computersQuery.isFetching;
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!fetching) {
      rotation.stopAnimation();
      rotation.setValue(0);
      return;
    }
    const spin = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    spin.start();
    return () => spin.stop();
  }, [fetching, rotation]);

  return (
    <Pressable
      accessibilityLabel="Refresh Computers"
      accessibilityRole="button"
      accessibilityState={{ busy: fetching }}
      hitSlop={8}
      onPress={() => {
        if (!fetching) void settings.computersQuery.refetch();
      }}
      style={{ alignItems: "center", height: 36, justifyContent: "center", width: 36 }}
    >
      <Animated.View
        style={{
          transform: [
            {
              rotate: rotation.interpolate({
                inputRange: [0, 1],
                outputRange: ["0deg", "360deg"],
              }),
            },
          ],
        }}
      >
        <RefreshIcon color={tintColor} size={20} strokeWidth={2.2} />
      </Animated.View>
    </Pressable>
  );
}

export function SettingsComputersScreen() {
  const router = useRouter();
  const settings = useMobileSettingsController();
  const theme = useMobileTheme();

  return (
    <AppScreen surface="sheet">
      <Stack.Screen
        options={{
          ...(process.env.EXPO_OS === "ios"
            ? {
                unstable_headerRightItems: ({ tintColor }) => [
                  {
                    type: "custom" as const,
                    element: (
                      <RefreshComputersButton
                        tintColor={typeof tintColor === "string" ? tintColor : theme.colors.label}
                      />
                    ),
                  },
                ],
              }
            : {
                headerRight: () => null,
              }),
        }}
      />

      {settings.computersQuery.isPending && settings.activeComputers.length === 0 ? (
        <Section>
          <ListSkeleton />
        </Section>
      ) : settings.activeComputers.length === 0 ? (
        <Section>
          <EmptyState
            layout="section"
            title="No Computers"
            message="No Computers yet."
          />
          {process.env.EXPO_OS !== "ios" ? (
            <View className="px-card-padding pb-card-padding">
              <GlassActionButtons
                actions={[
                  {
                    disabled: settings.computersQuery.isFetching,
                    label: settings.computersQuery.isFetching ? "Refreshing..." : "Refresh",
                    onPress: () => void settings.computersQuery.refetch(),
                  },
                ]}
              />
            </View>
          ) : null}
        </Section>
      ) : (
        <Section>
          <ComputerList
            computers={settings.activeComputers}
            onManage={(computer) =>
              router.push({
                pathname: "/settings/computer",
                params: { serverId: computer.server_id },
              })
            }
            onPress={(computer) => settings.selectComputer(computer)}
            selectedServerId={settings.selectedServerId}
          />
        </Section>
      )}

      <InlineError message={settings.error} />
    </AppScreen>
  );
}
