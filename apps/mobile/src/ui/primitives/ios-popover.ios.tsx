import {
  ArrowEdge,
  Popover,
  PopoverBackground,
  TriggerType,
} from "expo-ios-popover";
import type { IosPopoverDirection, IosPopoverProps, IosPopoverTriggerKind } from "./ios-popover.types";
import { POPOVER_PRESENT_ANIMATION } from "./ios-popover.types";

export { POPOVER_PRESENT_ANIMATION } from "./ios-popover.types";
export type { IosPopoverDirection, IosPopoverProps, IosPopoverTriggerKind } from "./ios-popover.types";

const DIRECTION: Record<IosPopoverDirection, ArrowEdge> = {
  any: ArrowEdge.Any,
  bottom: ArrowEdge.Bottom,
  leading: ArrowEdge.Leading,
  none: ArrowEdge.None,
  top: ArrowEdge.Top,
  trailing: ArrowEdge.Trailing,
};

const TRIGGER: Record<IosPopoverTriggerKind, TriggerType> = {
  longPress: TriggerType.LongPress,
  tap: TriggerType.Tap,
};

function IosPopoverRoot({
  children,
  direction = "any",
  trigger = "tap",
}: IosPopoverProps) {
  return (
    <Popover
      animation={POPOVER_PRESENT_ANIMATION}
      background={PopoverBackground.Default}
      direction={DIRECTION[direction]}
      trigger={TRIGGER[trigger]}
    >
      {children}
    </Popover>
  );
}

/** iOS: `expo-ios-popover`. Android: RN modal overlay — never this native module. */
export const IosPopover = Object.assign(IosPopoverRoot, {
  Content: Popover.Content,
  Pressable: Popover.Pressable,
  Trigger: Popover.Trigger,
});
