import { Button, Host } from "@expo/ui";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ComputerPicker } from "@/features/computers/ComputerPicker";
import { PairQrScanner } from "@/features/onboarding/PairQrScanner";
import { useAuthSignIn } from "@/features/onboarding/use-auth-sign-in";
import { radii } from "@/theme/radii";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";
import { useMobileTheme } from "@/theme/theme-store";
import { AppScreen, InlineError, Section } from "@/ui/layout/app-screen";
import { QrCodeIcon } from "@/ui/icons/lucide-native";
import { GithubMark, GoogleMark } from "@/ui/icons/oauth-marks";
import { expoUiButtonStretchModifiers } from "@/ui/primitives/expo-ui-button-modifiers";
import {
  expoUiButtonHostStyle,
  expoUiSecondaryStyle,
} from "@/ui/primitives/expo-ui-button-styles";

const buttonStretchModifiers = expoUiButtonStretchModifiers;

const PRODUCT_NAME = "Atmos";
const PRODUCT_SLOGAN = "Pair this phone with your Computer.";

/** Light: near-black dock on light page. Dark: elevated card on pure black page. */
const DOCK_LIGHT = "#0a0a0b";

const SCAN_STEPS = [
  "Open Atmos on computer or web",
  "Settings → Atmos Computer → Show QR",
  "Scan the QR on screen",
] as const;

const HERO_FADE_MS = 260;
const DOCK_FADE_MS = 200;
const STEP_STAGGER_MS = 65;
const STEP_SLIDE_MS = 300;

export type AuthConnectPresentation = "screen" | "sheet";

export type AuthConnectContentProps = {
  /**
   * `screen` — full-page embed (home / onboarding).
   * `sheet` — form-sheet chrome (grabber pad, sheet surfaces, edge fill).
   */
  presentation?: AuthConnectPresentation;
  initialScannerOpen?: boolean;
  onAuthenticated?: () => void;
};

/**
 * Shared pair / OAuth connect UI.
 * Use on the home screen when disconnected, or inside a form sheet elsewhere.
 */
export function AuthConnectContent({
  presentation = "screen",
  initialScannerOpen = false,
  onAuthenticated,
}: AuthConnectContentProps) {
  const theme = useMobileTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const auth = useAuthSignIn({ onAuthenticated });
  const [scannerOpen, setScannerOpen] = useState(initialScannerOpen);
  const [scannerMounted, setScannerMounted] = useState(initialScannerOpen);
  const isSheet = presentation === "sheet";

  const brandOpacity = useRef(new Animated.Value(initialScannerOpen ? 0 : 1)).current;
  const brandScale = useRef(new Animated.Value(initialScannerOpen ? 0.96 : 1)).current;
  const scannerOpacity = useRef(new Animated.Value(initialScannerOpen ? 1 : 0)).current;
  const scannerScale = useRef(new Animated.Value(initialScannerOpen ? 1 : 0.96)).current;
  const authDockOpacity = useRef(new Animated.Value(initialScannerOpen ? 0 : 1)).current;
  const stepsOpacity = useRef(new Animated.Value(initialScannerOpen ? 1 : 0)).current;
  const stepAnims = useRef(
    SCAN_STEPS.map(() => ({
      opacity: new Animated.Value(initialScannerOpen ? 1 : 0),
      translateY: new Animated.Value(initialScannerOpen ? 0 : 18),
    })),
  ).current;

  const cameraSize = Math.min(windowWidth - spacing.screenX * 2, 340);

  useEffect(() => {
    if (initialScannerOpen) setScannerOpen(true);
  }, [initialScannerOpen]);

  useEffect(() => {
    if (scannerOpen) {
      setScannerMounted(true);
      stepAnims.forEach((anim) => {
        anim.opacity.setValue(0);
        anim.translateY.setValue(22);
      });
      stepsOpacity.setValue(0);

      Animated.parallel([
        Animated.timing(brandOpacity, {
          toValue: 0,
          duration: HERO_FADE_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(brandScale, {
          toValue: 0.96,
          duration: HERO_FADE_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scannerOpacity, {
          toValue: 1,
          duration: HERO_FADE_MS + 40,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scannerScale, {
          toValue: 1,
          duration: HERO_FADE_MS + 40,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(authDockOpacity, {
          toValue: 0,
          duration: DOCK_FADE_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        Animated.timing(stepsOpacity, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }).start();
        Animated.stagger(
          STEP_STAGGER_MS,
          stepAnims.map((anim) =>
            Animated.parallel([
              Animated.timing(anim.opacity, {
                toValue: 1,
                duration: STEP_SLIDE_MS,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }),
              Animated.timing(anim.translateY, {
                toValue: 0,
                duration: STEP_SLIDE_MS,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }),
            ]),
          ),
        ).start();
      });
      return;
    }

    Animated.parallel([
      Animated.timing(scannerOpacity, {
        toValue: 0,
        duration: HERO_FADE_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scannerScale, {
        toValue: 0.96,
        duration: HERO_FADE_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(stepsOpacity, {
        toValue: 0,
        duration: DOCK_FADE_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      ...stepAnims.map((anim) =>
        Animated.parallel([
          Animated.timing(anim.opacity, {
            toValue: 0,
            duration: DOCK_FADE_MS,
            useNativeDriver: true,
          }),
          Animated.timing(anim.translateY, {
            toValue: 12,
            duration: DOCK_FADE_MS,
            useNativeDriver: true,
          }),
        ]),
      ),
    ]).start(() => {
      setScannerMounted(false);
      Animated.parallel([
        Animated.timing(brandOpacity, {
          toValue: 1,
          duration: HERO_FADE_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(brandScale, {
          toValue: 1,
          duration: HERO_FADE_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(authDockOpacity, {
          toValue: 1,
          duration: DOCK_FADE_MS + 40,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, [
    authDockOpacity,
    brandOpacity,
    brandScale,
    scannerOpen,
    scannerOpacity,
    scannerScale,
    stepAnims,
    stepsOpacity,
  ]);

  const refreshStyle = expoUiSecondaryStyle(theme.colors, auth.busy);

  if (auth.hasDeviceCredential) {
    return (
      <AppScreen
        surface={isSheet ? "sheet" : "screen"}
        footer={
          <Host
            matchContents={{ vertical: true }}
            colorScheme={theme.colorScheme}
            seedColor={refreshStyle.seedColor}
            style={expoUiButtonHostStyle}
          >
            <Button
              disabled={auth.busy}
              label={
                auth.computersQuery.isFetching ? "Checking..." : "Refresh Computers"
              }
              modifiers={buttonStretchModifiers}
              onPress={
                auth.busy
                  ? undefined
                  : () => {
                      if (!auth.computersQuery.isFetching) {
                        void auth.computersQuery.refetch();
                      }
                    }
              }
              style={refreshStyle.style}
              variant={refreshStyle.variant}
            />
          </Host>
        }
      >
        <Section>
          <View className="min-h-row-min-height flex-row items-center gap-2.5 px-row-x py-row-y">
            <View
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: theme.colors.green }}
            />
            <Text className="flex-1 text-label" style={typography.rowTitle}>
              Signed in
            </Text>
          </View>
        </Section>
        <ComputerPicker
          computers={auth.computersQuery.data ?? []}
          selectedServerId={auth.selectedServerId}
          onRefresh={() => void auth.computersQuery.refetch()}
          isRefreshing={auth.computersQuery.isFetching}
          onSelect={(serverId) => auth.createSession.mutate(serverId)}
        />
        <InlineError
          message={
            auth.localError ??
            (auth.computersQuery.error instanceof Error
              ? auth.computersQuery.error.message
              : auth.createSession.error instanceof Error
                ? auth.createSession.error.message
                : null)
          }
        />
      </AppScreen>
    );
  }

  const dockPadBottom = Math.max(insets.bottom, spacing.screenFooterBottom);
  const dockStackHeight = scannerOpen ? 236 : 186;
  const dockHeight = 18 + dockStackHeight + dockPadBottom;
  const signingIn = auth.signIn.isPending || auth.busy;
  // Page / dock stay inverted relative to each other (light page + dark dock,
  // dark page + elevated dock) so the rounded dock never melts into the page.
  const heroBackground = isSheet
    ? theme.colors.sheetBackground
    : theme.colors.background;
  const dockColor = theme.isDark ? theme.colors.cardElevated : DOCK_LIGHT;
  const dockSecondaryButton = theme.isDark ? "#48484a" : "#3a3a3c";
  const dockTertiaryButton = theme.isDark ? "#3a3a3c" : "#2c2c2e";
  const dockLabel = theme.isDark ? theme.colors.label : "#f5f5f7";
  const dockMuted = theme.isDark
    ? theme.colors.secondaryLabel
    : "rgba(245, 245, 247, 0.55)";
  const dockBadgeBg = theme.isDark
    ? "rgba(255, 255, 255, 0.10)"
    : "rgba(255, 255, 255, 0.12)";
  // Home screen sits under the large title; keep the viewfinder below “Atmos”.
  const scannerOffsetTop = isSheet ? 0 : 148;

  return (
    <View style={[styles.root, { backgroundColor: heroBackground }]}>
      <View
        style={[
          styles.heroShell,
          {
            backgroundColor: heroBackground,
            bottom: dockHeight,
          },
        ]}
      >
        {isSheet ? <View style={styles.grabberPad} /> : null}

        <View style={styles.hero}>
          <Animated.View
            pointerEvents={scannerOpen ? "none" : "auto"}
            style={[
              styles.heroLayer,
              {
                opacity: brandOpacity,
                transform: [{ scale: brandScale }],
              },
            ]}
          >
            <View style={styles.brandBlock}>
              {/* Sheet owns its own title; screen sits under the native “Atmos” header. */}
              {isSheet ? (
                <Text style={[styles.productName, { color: theme.colors.label }]}>
                  {PRODUCT_NAME}
                </Text>
              ) : null}
              <Text
                style={[
                  isSheet ? styles.productSlogan : styles.screenSlogan,
                  { color: theme.colors.secondaryLabel },
                ]}
              >
                {PRODUCT_SLOGAN}
              </Text>
            </View>
          </Animated.View>

          {scannerMounted ? (
            <Animated.View
              pointerEvents={scannerOpen ? "auto" : "none"}
              style={[
                styles.heroLayer,
                styles.scannerLayer,
                {
                  opacity: scannerOpacity,
                  paddingTop: scannerOffsetTop,
                  transform: [{ scale: scannerScale }],
                },
              ]}
            >
              <View
                style={[
                  styles.scannerWrap,
                  { width: cameraSize, height: cameraSize },
                ]}
              >
                <PairQrScanner
                  disabled={auth.busy || !scannerOpen}
                  onScanned={(value) => {
                    setScannerOpen(false);
                    auth.claimPair.mutate(value);
                  }}
                />
              </View>
            </Animated.View>
          ) : null}

          {/* Pin above the dock — never center-overlap the slogan / camera. */}
          <View pointerEvents="box-none" style={styles.errorPad}>
            <InlineError
              message={
                auth.localError ??
                (auth.claimPair.error instanceof Error
                  ? auth.claimPair.error.message
                  : auth.signIn.error instanceof Error
                    ? auth.signIn.error.message
                    : null)
              }
            />
          </View>
        </View>
      </View>

      <View
        style={[
          styles.dock,
          {
            backgroundColor: dockColor,
            paddingBottom: dockPadBottom,
          },
        ]}
      >
        <View style={[styles.dockStack, { height: dockStackHeight }]}>
          <Animated.View
            pointerEvents={scannerOpen ? "none" : "auto"}
            style={[styles.dockLayer, { opacity: authDockOpacity }]}
          >
            <View style={styles.dockButtons}>
              <DockButton
                backgroundColor="#ffffff"
                disabled={auth.busy}
                labelColor="#0a0a0b"
                label="Scan QR"
                leading={
                  <QrCodeIcon color="#0a0a0b" size={20} strokeWidth={2.2} />
                }
                onPress={() => {
                  auth.setLocalError(null);
                  setScannerOpen(true);
                }}
              />
              <DockButton
                backgroundColor={dockSecondaryButton}
                disabled={signingIn}
                labelColor={dockLabel}
                label={signingIn ? "Signing in..." : "Continue with GitHub"}
                leading={<GithubMark color={dockLabel} size={20} />}
                loading={auth.signIn.isPending}
                onPress={() => auth.signIn.mutate("github")}
              />
              <DockButton
                backgroundColor={dockTertiaryButton}
                disabled={signingIn}
                labelColor={dockLabel}
                label={signingIn ? "Signing in..." : "Continue with Google"}
                leading={<GoogleMark size={20} />}
                loading={auth.signIn.isPending}
                onPress={() => auth.signIn.mutate("google")}
              />
            </View>
          </Animated.View>

          <Animated.View
            pointerEvents={scannerOpen ? "auto" : "none"}
            style={[styles.dockLayer, { opacity: stepsOpacity }]}
          >
            <View style={styles.stepsBlock}>
              <Text style={[styles.stepsTitle, { color: dockMuted }]}>
                How to pair
              </Text>
              {SCAN_STEPS.map((step, index) => (
                <Animated.View
                  key={step}
                  style={[
                    styles.stepRow,
                    {
                      opacity: stepAnims[index]?.opacity,
                      transform: [
                        { translateY: stepAnims[index]?.translateY ?? 0 },
                      ],
                    },
                  ]}
                >
                  <View
                    style={[styles.stepBadge, { backgroundColor: dockBadgeBg }]}
                  >
                    <Text style={[styles.stepBadgeText, { color: dockLabel }]}>
                      {index + 1}
                    </Text>
                  </View>
                  <Text
                    numberOfLines={1}
                    style={[styles.stepText, { color: dockLabel }]}
                  >
                    {step}
                  </Text>
                </Animated.View>
              ))}
              <DockButton
                backgroundColor="#ffffff"
                disabled={auth.busy}
                labelColor="#0a0a0b"
                label="Hide scanner"
                leading={
                  <QrCodeIcon color="#0a0a0b" size={20} strokeWidth={2.2} />
                }
                onPress={() => setScannerOpen(false)}
              />
            </View>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

function DockButton({
  backgroundColor,
  disabled,
  label,
  labelColor,
  leading,
  loading,
  onPress,
}: {
  backgroundColor: string;
  disabled?: boolean;
  label: string;
  labelColor: string;
  leading?: ReactNode;
  loading?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.dockButton,
        {
          backgroundColor,
          opacity: disabled ? 0.55 : pressed ? 0.88 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={labelColor} />
      ) : (
        <View style={styles.dockButtonInner}>
          {leading ? <View style={styles.dockIcon}>{leading}</View> : null}
          <Text style={[styles.dockButtonLabel, { color: labelColor }]}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    alignSelf: "stretch",
    flex: 1,
    height: "100%",
    overflow: "hidden",
    width: "100%",
  },
  heroShell: {
    left: 0,
    overflow: "hidden",
    position: "absolute",
    right: 0,
    top: 0,
  },
  grabberPad: {
    height: 14,
    width: "100%",
  },
  hero: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: spacing.screenX,
    width: "100%",
  },
  heroLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.screenX,
  },
  // Keep the camera vertically centered in the remaining space below the offset.
  scannerLayer: {
    justifyContent: "center",
  },
  brandBlock: {
    alignItems: "center",
    gap: 10,
    maxWidth: 320,
  },
  productName: {
    fontSize: 40,
    fontWeight: "700",
    letterSpacing: -1.1,
    lineHeight: 48,
    textAlign: "center",
  },
  productSlogan: {
    fontSize: 16,
    fontWeight: "400",
    letterSpacing: -0.2,
    lineHeight: 22,
    textAlign: "center",
  },
  screenSlogan: {
    fontSize: 17,
    fontWeight: "400",
    letterSpacing: -0.2,
    lineHeight: 24,
    textAlign: "center",
  },
  scannerWrap: {
    alignSelf: "center",
  },
  errorPad: {
    bottom: 12,
    left: spacing.screenX,
    position: "absolute",
    right: spacing.screenX,
  },
  dock: {
    // Rounded top edge so the dark CTA block reads as a sheet dock, not a flat split.
    borderCurve: "continuous",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    bottom: 0,
    left: 0,
    paddingHorizontal: spacing.screenX,
    paddingTop: 18,
    position: "absolute",
    right: 0,
    width: "100%",
  },
  dockStack: {
    position: "relative",
    width: "100%",
  },
  dockLayer: {
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    width: "100%",
  },
  dockButtons: {
    gap: 12,
    width: "100%",
  },
  stepsBlock: {
    gap: 12,
    width: "100%",
  },
  stepsTitle: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  stepRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  stepBadge: {
    alignItems: "center",
    borderRadius: 999,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  stepBadgeText: {
    fontSize: 13,
    fontWeight: "700",
  },
  stepText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  dockButton: {
    alignItems: "center",
    borderCurve: "continuous",
    borderRadius: radii.control,
    height: 54,
    justifyContent: "center",
    width: "100%",
  },
  dockButtonInner: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
  },
  dockIcon: {
    alignItems: "center",
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  dockButtonLabel: {
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
});
