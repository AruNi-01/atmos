import { Button, Host, HStack } from "@expo/ui/swift-ui";
import {
  buttonStyle,
  controlSize,
  glassEffect,
  imageScale,
  labelStyle,
  padding,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useMobileTheme } from "@/theme/theme-store";

export function TerminalTabActions({
  onCreate,
  onOpenGroup,
}: {
  onCreate: () => void;
  onOpenGroup: () => void;
}) {
  const theme = useMobileTheme();
  const iconModifiers = [
    buttonStyle("plain"),
    controlSize("regular"),
    imageScale("medium"),
    labelStyle("iconOnly"),
    tint(theme.colors.terminalFg),
  ];

  return (
    <Host colorScheme="dark" matchContents seedColor={theme.colors.terminalFg}>
      <HStack
        alignment="center"
        modifiers={[
          glassEffect({
            glass: { interactive: true, variant: "regular" },
            shape: "capsule",
          }),
          padding({ horizontal: 4 }),
        ]}
        spacing={0}
      >
        <Button
          label="New terminal"
          modifiers={iconModifiers}
          onPress={onCreate}
          systemImage="plus"
        />
        <Button
          label="Terminal list"
          modifiers={iconModifiers}
          onPress={onOpenGroup}
          systemImage="square.grid.2x2"
        />
      </HStack>
    </Host>
  );
}
