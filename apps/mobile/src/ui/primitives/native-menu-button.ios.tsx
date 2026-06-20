import type { ReactNode } from "react";
import { Button, Host, Menu, Section } from "@expo/ui/swift-ui";
import { disabled as disabledModifier, labelStyle, tint } from "@expo/ui/swift-ui/modifiers";
import { colors } from "@/theme/colors";
import type { NativeMenuAction, NativeMenuButtonProps } from "./native-menu-button.types";

export function NativeMenuButton({
  actions,
  disabled,
  iconOnly,
  label,
  onAction,
  systemImage,
  title,
}: NativeMenuButtonProps) {
  const items = actions.map((action) => renderAction(action, onAction));
  const menuModifiers = [
    tint(disabled ? colors.tertiaryLabel : colors.label),
    ...(iconOnly ? [labelStyle("iconOnly")] : []),
  ];

  return (
    <Host colorScheme="light" matchContents>
      <Menu
        label={label}
        modifiers={menuModifiers}
        systemImage={systemImage}
      >
        {title ? <Section title={title}>{items}</Section> : items}
      </Menu>
    </Host>
  );
}

function renderAction(action: NativeMenuAction, onAction: (actionId: string) => void): ReactNode {
  if (action.attributes?.hidden) return null;

  const actionId = action.id ?? action.title;
  const systemImage = action.state === "on" ? "checkmark" : typeof action.image === "string" ? action.image : undefined;
  const modifiers = action.attributes?.disabled ? [disabledModifier(true)] : undefined;

  if (action.subactions?.length) {
    const children = action.subactions.map((subaction) => renderAction(subaction, onAction));
    if (action.displayInline) {
      return (
        <Section key={actionId} title={action.title}>
          {children}
        </Section>
      );
    }
    return (
      <Menu key={actionId} label={action.title} systemImage={systemImage}>
        {children}
      </Menu>
    );
  }

  return (
    <Button
      key={actionId}
      label={action.title}
      modifiers={modifiers}
      onPress={() => onAction(actionId)}
      role={action.attributes?.destructive ? "destructive" : undefined}
      systemImage={systemImage}
    />
  );
}
