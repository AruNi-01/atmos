import { useEffect, useState } from "react";
import { Button as ExpoButton, Host as ExpoHost } from "@expo/ui";
import { Button, Host, HStack } from "@expo/ui/swift-ui";
import {
  background,
  buttonStyle,
  controlSize,
  disabled as disabledModifier,
  font,
  foregroundStyle,
  glassEffect,
  opacity,
  padding,
  shapes,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import { AccessibilityInfo, Platform, View } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { expoUiDangerStyle, expoUiSecondaryStyle } from "@/ui/primitives/expo-ui-button-styles";
import { shouldUseLiquidGlass } from "./glass-availability";

/** Matches the old filled chip: padding 12×8, 14pt semibold. */
export const GLASS_CHIP_FONT_SIZE = 14;
export const GLASS_CHIP_PADDING = { horizontal: 12, vertical: 8 } as const;
/**
 * Air-measured visual chip height (32.3–33.0pt). Pill is 36, compact composer 52.
 * Do not clip with negative vertical margin — that overlaps wrap rows.
 */
export const GLASS_CHIP_HEIGHT = 33;
export const GLASS_CHIP_HOST_STYLE = {
  height: GLASS_CHIP_HEIGHT,
  justifyContent: "center" as const,
};
/** Slight dim — SwiftUI `disabled()` on glass nearly vanishes in light. */
export const GLASS_CHIP_DISABLED_OPACITY = 0.55;
const FALLBACK_CHIP_HEIGHT = GLASS_CHIP_HEIGHT;

export type GlassChipTone = "primary" | "ghost";

export type GlassAction = {
  disabled?: boolean;
  label: string;
  onPress: () => void;
  role?: "destructive";
  /** Permission Allow is primary; Deny and other options are ghost. */
  tone?: GlassChipTone;
};

export function iosGlassChipModifiers(input: {
  fillColor: string;
  inkColor: string;
  isDisabled: boolean;
  isGhost?: boolean;
  useLiquidGlass: boolean;
}) {
  const dim = opacity(input.isDisabled ? GLASS_CHIP_DISABLED_OPACITY : 1);
  const type = font({
    size: GLASS_CHIP_FONT_SIZE,
    weight: input.isGhost ? "medium" : "semibold",
  });
  if (input.useLiquidGlass) {
    return [
      buttonStyle("plain"),
      controlSize("mini"),
      type,
      padding(GLASS_CHIP_PADDING),
      glassEffect({
        glass: { interactive: true, variant: "regular" },
        shape: "capsule",
      }),
      ...(input.isGhost ? [foregroundStyle(input.inkColor), tint(input.inkColor)] : []),
      dim,
    ];
  }
  return [
    buttonStyle("plain"),
    controlSize("mini"),
    type,
    padding(GLASS_CHIP_PADDING),
    background(input.fillColor, shapes.capsule()),
    foregroundStyle(input.inkColor),
    tint(input.inkColor),
    dim,
  ];
}

/** Compact labeled glass chip. iOS uses `glassEffect` on a plain button. */
export function GlassTextButton({ disabled, label, onPress, role, tone }: GlassAction) {
  if (Platform.OS === "ios") {
    return (
      <IosGlassTextButton
        disabled={disabled}
        label={label}
        onPress={onPress}
        role={role}
        tone={tone}
      />
    );
  }
  return (
    <FallbackGlassTextButton
      disabled={disabled}
      label={label}
      onPress={onPress}
      role={role}
      tone={tone}
    />
  );
}

/** Right-aligned glass actions. Two actions sit on one row. */
export function GlassActionButtons({ actions }: { actions: GlassAction[] }) {
  if (Platform.OS === "ios") {
    return <IosGlassActionButtons actions={actions} />;
  }
  return <FallbackActionButtons actions={actions} />;
}

function useReduceTransparencyEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let alive = true;
    const read = AccessibilityInfo.isReduceTransparencyEnabled;
    if (typeof read !== "function") return undefined;
    void read()
      .then((value) => {
        if (alive) setEnabled(value);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged",
      setEnabled,
    );
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);

  return enabled;
}

function chipInkColor(
  colors: { label: string; red: string; secondaryLabel: string },
  role: GlassAction["role"],
  tone: GlassAction["tone"],
) {
  if (role === "destructive") return colors.red;
  if (tone === "ghost") return colors.secondaryLabel;
  return colors.label;
}

function IosGlassTextButton({ disabled, label, onPress, role, tone }: GlassAction) {
  const theme = useMobileTheme();
  const reduceTransparency = useReduceTransparencyEnabled();
  const useLiquidGlass = shouldUseLiquidGlass({
    apiAvailable: isGlassEffectAPIAvailable(),
    liquidGlassAvailable: isLiquidGlassAvailable(),
    reduceTransparency,
  });
  const isDisabled = Boolean(disabled);
  const isGhost = tone === "ghost";
  const inkColor = chipInkColor(theme.colors, role, tone);
  const fillColor = theme.colors.control;

  return (
    <View style={GLASS_CHIP_HOST_STYLE}>
      <Host
        colorScheme={theme.colorScheme}
        matchContents={{ horizontal: true, vertical: false }}
        style={{ height: GLASS_CHIP_HEIGHT }}
      >
        <HStack alignment="center" spacing={0}>
          <Button
            label={label}
            modifiers={iosGlassChipModifiers({
              fillColor,
              inkColor,
              isDisabled,
              isGhost,
              useLiquidGlass,
            })}
            onPress={isDisabled ? undefined : onPress}
            role={useLiquidGlass ? (role ?? "default") : "default"}
          />
        </HStack>
      </Host>
    </View>
  );
}

function FallbackGlassTextButton({ disabled, label, onPress, role, tone }: GlassAction) {
  const theme = useMobileTheme();
  const look =
    role === "destructive"
      ? expoUiDangerStyle(theme.colors, disabled)
      : expoUiSecondaryStyle(theme.colors, disabled);
  const isDisabled = Boolean(disabled);

  return (
    <View style={GLASS_CHIP_HOST_STYLE}>
      <ExpoHost
        colorScheme={theme.colorScheme}
        matchContents={{ vertical: true }}
        seedColor={tone === "ghost" ? theme.colors.secondaryLabel : look.seedColor}
      >
        <ExpoButton
          disabled={isDisabled}
          label={label}
          onPress={isDisabled ? undefined : onPress}
          style={{
            height: FALLBACK_CHIP_HEIGHT,
            opacity: isDisabled ? GLASS_CHIP_DISABLED_OPACITY : 1,
          }}
          variant="outlined"
        />
      </ExpoHost>
    </View>
  );
}

function IosGlassActionButtons({ actions }: { actions: GlassAction[] }) {
  const theme = useMobileTheme();

  return (
    <View style={{ alignItems: "flex-end" }}>
      <Host colorScheme={theme.colorScheme} matchContents>
        <HStack alignment="center" spacing={8}>
          {actions.map((action) => (
            <Button
              key={action.label}
              label={action.label}
              modifiers={[
                buttonStyle("glass"),
                controlSize("regular"),
                disabledModifier(Boolean(action.disabled)),
              ]}
              onPress={action.disabled ? undefined : action.onPress}
              role={action.role ?? "default"}
            />
          ))}
        </HStack>
      </Host>
    </View>
  );
}

function FallbackActionButtons({ actions }: { actions: GlassAction[] }) {
  const theme = useMobileTheme();

  return (
    <View
      style={{ alignItems: "flex-end", flexDirection: "row", gap: 8, justifyContent: "flex-end" }}
    >
      {actions.map((action) => {
        const look = expoUiSecondaryStyle(theme.colors, action.disabled);
        return (
          <ExpoHost
            colorScheme={theme.colorScheme}
            key={action.label}
            matchContents={{ vertical: true }}
            seedColor={action.role === "destructive" ? theme.colors.red : look.seedColor}
          >
            <ExpoButton
              disabled={action.disabled}
              label={action.label}
              onPress={action.disabled ? undefined : action.onPress}
              style={look.style}
              variant="outlined"
            />
          </ExpoHost>
        );
      })}
    </View>
  );
}
