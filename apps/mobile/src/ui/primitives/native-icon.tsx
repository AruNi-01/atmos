import { Host, Icon } from "@expo/ui";
import type { IconName, IconSelectSpec } from "@expo/ui";

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
  return (
    <Host colorScheme="light" matchContents>
      <Icon color={color} name={name} size={size} />
    </Host>
  );
}
