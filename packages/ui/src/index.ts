"use client";

// UI Components
export * from "./components/ui/button";
export * from "./components/ui/card";
export * from "./components/ui/checkbox";
export * from "./components/ui/qr-code";
export * from "./components/ui/input";
export * from "./components/ui/input-group";
export * from "./components/ui/label";
export * from "./components/ui/dialog";
export * from "./components/ui/drawer";
export * from "./components/ui/scroll-area";
export * from "./components/ui/select";
export * from "./components/ui/toast";
export * from "./components/theme-toggle";
export * from "./components/language-selector";
export * from "./components/ui/dropdown-menu";
export * from "./components/ui/popover";
export * from "./components/ui/pagination";
export {
  ColorPicker,
  ColorPickerPopover,
  ColorPickerPortalContainer,
  ColorSwatch,
  ColorTile,
  parseColor,
  buildParsed,
  isColorEyedropperActive,
} from "./components/ui/color-picker";
export type {
  ColorPickerProps,
  ColorPickerPopoverProps,
  ColorSwatchProps,
  ColorFormat,
  ParsedColor,
} from "./components/ui/color-picker";
export * from "./components/ui/tabs";
export {
  TabsSubtle,
  TabsSubtleItem,
  TabsSubtlePanel,
} from "./components/ui/tabs-subtle";
export {
  ActionSwapCascadeButton,
  ActionSwapCascadeText,
  ActionSwapCascadeIcon,
} from "./components/motion/action-swap-cascade";
export type {
  ActionSwapCascadeButtonProps,
  ActionSwapCascadeTextProps,
  ActionSwapCascadeIconProps,
  ActionSwapItem,
  ActionSwapButtonSize,
  ActionSwapButtonVariant,
} from "./components/motion/action-swap-cascade";
// beui.dev motion tabs — aliased (ui/tabs already exports Tabs/TabsList/…)
export {
  Tabs as MotionTabs,
  TabsList as MotionTabsList,
  TabsTrigger as MotionTabsTrigger,
  TabsContent as MotionTabsContent,
} from "./components/motion/tabs";
export {
  Command,
  CommandDialog,
  CommandInput,
  CommandInputWithoutBorder,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from "./components/ui/command";
export * from "./components/ui/collapsible";
export * from "./components/ui/textarea";
export {
  Timer as UiTimer,
  TimerDisplay,
  TimerIcon as UiTimerIcon,
  TimerRoot,
  useTimer,
  type TimerDisplayProps,
  type TimerIconProps,
  type TimerProps,
  type TimerRootProps,
  type UseTimerOptions,
  type UseTimerReturn,
} from "./components/ui/timer";
export * from "./components/ui/tooltip";
export * from "./components/ui/toggle-group";
export * from "./components/ui/skeleton";
export * from "./components/ui/preview-card";
export * from "./components/logo-svg";
export * from "./components/ui/avatar";
export { Badge, badgeVariants } from "./components/ui/badge";
export * from "./components/ui/craft-button";
export * from "./components/cta-1";
export * from "./components/ui/marquee";
export * from "./components/ui/motion-preset";
export * from "./components/ui/navigation-menu";
export * from "./components/ui/rating";
export * from "./components/ui/separator";
export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "./components/ui/sidebar";
export * from "./components/ui/switch";
export {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "./components/ui/table";
export * from "./components/ui/accordion";
export * from "./components/ui/expandable-screen";
export { Calendar, CalendarDayButton } from "./components/ui/calendar";
export * from "./components/ui/flow-button";
export * from "./components/ui/border-beam";
export { ShineBorder } from "./components/ui/shine-border";
export { TextShimmer } from "./components/ui/text-shimmer";
export { DotmSquare12 } from "./components/ui/dotm-square-12";
export type { DotmSquare12Props } from "./components/ui/dotm-square-12";
export { TerminalLoader } from "./components/ui/terminal-loader";
export type { TerminalLoaderProps } from "./components/ui/terminal-loader";
export { ImageGenerationCanvas } from "./components/ui/image-generation";
export type { ImageGenerationCanvasProps } from "./components/ui/image-generation";

// Dither / ordered-dot charts (MIT-adapted Amicro simple-comp style)
export {
  DitherPanel,
  DitherGrowth,
  DitherHeatmap,
  DitherStackedBars,
  DitherDonut,
  DitherFunnel,
  DitherShareBar,
  DitherRevenueLines,
  DitherTooltip,
  bandColor,
  ditherInk,
  heatmapLevelColor,
} from "./components/dither";
export type {
  DitherPanelProps,
  DitherGrowthProps,
  DitherHeatmapCell,
  DitherHeatmapHoverInfo,
  DitherHeatmapMonthLabel,
  DitherHeatmapProps,
  DitherHeatmapWeekdayLabel,
  DitherStackedBar,
  DitherStackedBarsProps,
  DitherDonutProps,
  DitherDonutSlice,
  DitherFunnelProps,
  DitherFunnelStage,
  DitherShareBarProps,
  DitherShareSegment,
  DitherRevenueLinesProps,
  DitherRevenueSeries,
  DitherTooltipLine,
  DitherTooltipProps,
  DitherTooltipSliding,
  DitherTooltipState,
  DitherTheme,
} from "./components/dither";
export { TextShimmerWave } from "./components/ui/text-shimmer-wave";
export { TextScramble } from "./components/ui/text-scramble";
export { TextMorph } from "./components/ui/text-morph";
export { NativeFollowCursor } from "./components/native/native-follow-cursor";
export type { NativeFollowCursorProps } from "./components/native/native-follow-cursor";
export { AnimatedNumber } from "./components/ui/animated-number";
export type { AnimatedNumberProps } from "./components/ui/animated-number";
export { SlidingNumber } from "./components/ui/sliding-number";
export type { SlidingNumberProps } from "./components/ui/sliding-number";
export {
  SlidingMetric,
  compactSlidingParts,
  currencySlidingParts,
  percentSlidingParts,
  detailedSlidingParts,
  localeDecimalSeparator,
} from "./components/ui/sliding-metric";
export type {
  SlidingMetricParts,
  SlidingMetricProps,
} from "./components/ui/sliding-metric";
export {
  Sidebar as MotionSidebar,
  SidebarContent as MotionSidebarContent,
  SidebarGroup as MotionSidebarGroup,
  SidebarGroupLabel as MotionSidebarGroupLabel,
  SidebarHeader as MotionSidebarHeader,
  SidebarMenu as MotionSidebarMenu,
  SidebarMenuButton as MotionSidebarMenuButton,
  SidebarMenuItem as MotionSidebarMenuItem,
  SidebarProvider as MotionSidebarProvider,
} from "./components/animate-ui/components/radix/sidebar";

// AI Elements
export * from "./components/ai-elements/message";
export * from "./components/ai-elements/conversation";
export * from "./components/ai-elements/reasoning";
export * from "./components/ai-elements/confirmation";
export * from "./components/ai-elements/attachments";
export * from "./components/ai-elements/prompt-input";
export * from "./components/ai-elements/tool";
export {
  Terminal as AcpTerminal,
  TerminalHeader as AcpTerminalHeader,
  TerminalTitle as AcpTerminalTitle,
  TerminalStatus as AcpTerminalStatus,
  TerminalActions as AcpTerminalActions,
  TerminalCopyButton as AcpTerminalCopyButton,
  TerminalClearButton as AcpTerminalClearButton,
  TerminalContent as AcpTerminalContent,
} from "./components/ai-elements/terminal";

// Icons
export { FilledBellIcon } from "./components/icons/filled-bell-icon";
export type { AnimatedIconHandle, AnimatedIconProps } from "./components/icons/filled-bell-icon";
export { BotMessageSquareIcon } from "./components/icons/bot-message-square";
export type { BotMessageSquareHandle } from "./components/icons/bot-message-square";
export { GithubIcon } from "./components/icons/github-icon";
export type { GithubIconHandle } from "./components/icons/github-icon";
export { LinearIcon } from "./components/icons/linear-icon";
export { XIcon } from "./components/icons/x-icon";
export { RedditIcon } from "./components/icons/reddit-icon";
export { FacebookIcon } from "./components/icons/facebook-icon";
export { ThreadsIcon } from "./components/icons/threads-icon";
export { default as ArrowNarrowUpDashedIcon } from "./components/icons/arrow-narrow-up-dashed-icon";
export { default as ArrowNarrowDownDashedIcon } from "./components/icons/arrow-narrow-down-dashed-icon";
export { default as SimpleCheckedIcon } from "./components/icons/simple-checked-icon";
export { GitPullRequestCreateIcon } from "./components/icons/git-pull-request-create-icon";
export type { GitPullRequestCreateIconHandle } from "./components/icons/git-pull-request-create-icon";
export { GitPullRequestClosedIcon } from "./components/icons/git-pull-request-closed-icon";
export type { GitPullRequestClosedIconHandle } from "./components/icons/git-pull-request-closed-icon";
export { UserIcon } from "./components/icons/user-icon";
export type { UserIconHandle } from "./components/icons/user-icon";

// Utilities
export { cn } from "./lib/utils";
export * from "./utils/file-icons";

// Third Party Components
export * from "react-resizable-panels";
export * from "lucide-react";

// DnD Kit (Drag and Drop)
export * from "@dnd-kit/core";
export * from "@dnd-kit/sortable";
export * from "@dnd-kit/utilities";
export * from "@dnd-kit/modifiers";

// Auth & Particle Field Components
export * from "./components/particle-field";
export * from "./components/auth-shell";
export * from "./components/auth-split-layout";
