import React from "react";
import {
  AlertCircle,
  AlertTriangle,
  AlignLeft,
  AppWindow,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Badge as BadgeIcon,
  Ban,
  BarChart3,
  Bell,
  Calendar,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Circle,
  CircleDashed,
  CircleDot,
  CircleUser,
  ClipboardList,
  Columns2,
  Columns3,
  Command,
  Component,
  File,
  Ghost,
  Image,
  Layers,
  Link2,
  Maximize2,
  MousePointerClick,
  Sparkles,
  SquareDashed,
  Upload,
  User,
  CreditCard,
  FormInput,
  GalleryHorizontal,
  Group,
  Hash,
  Inbox,
  Info,
  Keyboard,
  LayoutPanelTop,
  LayoutTemplate,
  List,
  ListChecks,
  ListFilter,
  LoaderCircle,
  LogIn,
  MapPin,
  Menu,
  MessageCircle,
  MessageSquare,
  MessagesSquare,
  Minus,
  MoreHorizontal,
  Navigation,
  Paperclip,
  PanelBottom,
  PanelLeft,
  PanelRight,
  RectangleHorizontal,
  ScanSearch,
  Settings,
  SlidersHorizontal,
  Square,
  StretchHorizontal,
  Table,
  Table2,
  Tag,
  TextCursorInput,
  ToggleLeft,
  Type,
  UnfoldVertical,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  accordion: ChevronsDownUp,
  alert: AlertCircle,
  "alert-dialog": AlertTriangle,
  "aspect-ratio": RectangleHorizontal,
  attachment: Paperclip,
  avatar: CircleUser,
  badge: BadgeIcon,
  breadcrumb: ChevronRight,
  bubble: MessageCircle,
  button: Square,
  "button-group": Columns2,
  calendar: Calendar,
  card: CreditCard,
  carousel: GalleryHorizontal,
  chart: BarChart3,
  checkbox: CheckSquare,
  collapsible: ChevronsUpDown,
  combobox: ChevronsUpDown,
  command: Command,
  "context-menu": MousePointerClick,
  "data-table": Table2,
  "date-picker": CalendarDays,
  dialog: AppWindow,
  direction: ArrowLeftRight,
  drawer: PanelBottom,
  "dropdown-menu": ChevronDown,
  empty: Inbox,
  field: FormInput,
  form: ClipboardList,
  "hover-card": ScanSearch,
  input: TextCursorInput,
  "input-group": Group,
  "input-otp": Hash,
  item: List,
  kbd: Keyboard,
  label: Tag,
  marker: MapPin,
  menubar: Menu,
  message: MessageSquare,
  "message-scroller": MessagesSquare,
  "native-select": ListFilter,
  "navigation-menu": Navigation,
  pagination: MoreHorizontal,
  popover: MessageSquare,
  progress: LoaderCircle,
  questionnaire: ListChecks,
  "radio-group": CircleDot,
  resizable: StretchHorizontal,
  "scroll-area": UnfoldVertical,
  select: ChevronDown,
  separator: Minus,
  sheet: PanelRight,
  sidebar: PanelLeft,
  skeleton: Square,
  slider: SlidersHorizontal,
  sonner: Bell,
  spinner: LoaderCircle,
  switch: ToggleLeft,
  table: Table,
  tabs: LayoutPanelTop,
  textarea: AlignLeft,
  toast: Bell,
  toggle: ToggleLeft,
  "toggle-group": Columns3,
  tooltip: Info,
  typography: Type,
  "block.auth-form": LogIn,
  "block.settings-shell": Settings,
  "block.empty-state": Inbox,
  "block.nav-content": LayoutTemplate,
};

export const ComponentSidebarIcon = Component;

/** shadcn Blocks glyph: 2×2 rounded tiles, not Lucide's window `Blocks`. */
export function BlockSidebarIcon({
  size = 16,
  strokeWidth = 2,
}: {
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="8" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" />
      <rect x="13" y="13" width="8" height="8" rx="2" />
    </svg>
  );
}

const VARIANT_ICONS: Record<string, LucideIcon> = {
  all: Layers,
  default: Circle,
  secondary: CircleDashed,
  outline: SquareDashed,
  ghost: Ghost,
  destructive: Ban,
  link: Link2,
  trigger: MousePointerClick,
  open: Maximize2,
  bar: Menu,
  collapsed: ChevronRight,
  expanded: ChevronDown,
  image: Image,
  uploading: Upload,
  file: File,
  received: ArrowDownLeft,
  sent: ArrowUpRight,
  user: User,
  assistant: Sparkles,
  status: CircleDot,
  separator: Minus,
};

export function CatalogTypeIcon({
  componentType,
  size = 14,
}: {
  componentType: string;
  size?: number;
}) {
  const Icon = ICONS[componentType] ?? Square;
  return <Icon size={size} strokeWidth={2} aria-hidden />;
}

export function catalogVariantIconName(variant: string): string {
  return variant in VARIANT_ICONS ? variant : "default";
}

export function CatalogVariantIcon({
  variant,
  size = 14,
}: {
  variant: string;
  size?: number;
}) {
  const Icon = VARIANT_ICONS[catalogVariantIconName(variant)] ?? Circle;
  return <Icon size={size} strokeWidth={2} aria-hidden />;
}

export function catalogIconTypes(): string[] {
  return Object.keys(ICONS);
}

export function catalogVariantIconTypes(): string[] {
  return Object.keys(VARIANT_ICONS);
}
