import { Host, Icon } from "@expo/ui";
import type { IconName, IconSelectSpec } from "@expo/ui";
import { useMobileTheme } from "@/theme/theme-store";

export type NativeIconName = IconName;

export const selectNativeIcon = (spec: IconSelectSpec) => Icon.select(spec);

export function NativeIcon({
  color,
  name,
  size = 22,
}: {
  color: string;
  name: NativeIconName;
  size?: number;
}) {
  const theme = useMobileTheme();

  return (
    <Host colorScheme={theme.colorScheme} matchContents>
      <Icon color={color} name={name} size={size} />
    </Host>
  );
}
