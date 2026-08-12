import {
  Button as ComposeButton,
  Host,
  Row,
  Shape,
  Surface,
  Text,
  TextButton,
} from "@expo/ui/jetpack-compose";
import { padding } from "@expo/ui/jetpack-compose/modifiers";
import { radii, type MobileThemeColors } from "@/theme/colors";
import { useMobileTheme } from "@/theme/theme-store";
import { NativeButtonControl } from "./native-button-control";
import type { NativeButtonControlTone, NativeButtonProps } from "./native-button.types";

function isControlSurface(props: NativeButtonProps) {
  return props.surface === "control";
}

function resolveControlTone(props: NativeButtonProps): NativeButtonControlTone {
  if (props.tone === "secondary" || props.tone === "danger" || props.tone === "text") {
    return props.tone;
  }
  if (props.variant === "text") {
    return "text";
  }
  return "default";
}

export function NativeButton(props: NativeButtonProps) {
  if (isControlSurface(props)) {
    return (
      <NativeButtonControl
        disabled={props.disabled}
        grow={props.grow}
        icon={props.icon}
        label={props.label}
        onPress={props.onPress}
        tone={resolveControlTone(props)}
      />
    );
  }

  const {
    disabled,
    label,
    onPress,
    tone = "default",
    variant = "filled",
  } = props;
  const theme = useMobileTheme();
  const color = buttonColorByVariant(tone, theme.colors)[variant];

  if (variant === "outlined") {
    return (
      <Host matchContents colorScheme={theme.colorScheme} seedColor={theme.colors.label}>
        <Surface
          border={{ color: color.border, width: 1 }}
          color={color.background}
          contentColor={color.text}
          enabled={!disabled}
          onClick={disabled ? undefined : onPress}
          shape={Shape.RoundedCorner({ cornerRadii: controlCornerRadii })}
        >
          <Row
            horizontalArrangement="center"
            verticalAlignment="center"
            modifiers={[padding(14, 8, 14, 8)]}
          >
            <Text color={disabled ? theme.colors.tertiaryLabel : color.text} style={{ typography: "labelLarge" }}>
              {label}
            </Text>
          </Row>
        </Surface>
      </Host>
    );
  }

  const ButtonComponent = buttonComponentByVariant[variant];

  return (
    <Host matchContents colorScheme={theme.colorScheme} seedColor={theme.colors.label}>
      <ButtonComponent
        colors={{
          containerColor: color.background,
          contentColor: color.text,
          disabledContainerColor: theme.colors.controlDisabled,
          disabledContentColor: theme.colors.tertiaryLabel,
        }}
        contentPadding={buttonPaddingByVariant[variant]}
        enabled={!disabled}
        onClick={disabled ? undefined : onPress}
        shape={Shape.RoundedCorner({ cornerRadii: controlCornerRadii })}
      >
        <Text color={disabled ? theme.colors.tertiaryLabel : color.text} style={{ typography: "labelLarge" }}>
          {label}
        </Text>
      </ButtonComponent>
    </Host>
  );
}

const controlCornerRadii = {
  bottomEnd: radii.control,
  bottomStart: radii.control,
  topEnd: radii.control,
  topStart: radii.control,
};

const buttonComponentByVariant = {
  filled: ComposeButton,
  text: TextButton,
};

function buttonColorByVariant(
  tone: NonNullable<NativeButtonProps["tone"]>,
  themeColors: MobileThemeColors,
) {
  const isInverse = tone === "inverse";
  return {
    filled: {
      background: isInverse ? themeColors.labelInverse : themeColors.label,
      border: "transparent",
      text: isInverse ? themeColors.label : themeColors.labelInverse,
    },
    outlined: {
      background: isInverse ? "transparent" : themeColors.control,
      border: isInverse ? themeColors.labelInverse : themeColors.controlBorder,
      text: isInverse ? themeColors.labelInverse : themeColors.label,
    },
    text: {
      background: "transparent",
      border: "transparent",
      text: isInverse ? themeColors.labelInverse : themeColors.label,
    },
  };
}

const buttonPaddingByVariant = {
  filled: {
    bottom: 12,
    end: 20,
    start: 20,
    top: 12,
  },
  outlined: {
    bottom: 12,
    end: 20,
    start: 20,
    top: 12,
  },
  text: {
    bottom: 7,
    end: 8,
    start: 8,
    top: 7,
  },
};
