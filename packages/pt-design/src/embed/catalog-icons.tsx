import React from "react";
import {
  AlertCircle,
  AlertTriangle,
  AlignLeft,
  AppWindow,
  AreaChart,
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
  CreditCard,
  File,
  FormInput,
  GalleryHorizontal,
  Gauge,
  Ghost,
  Group,
  Hash,
  Image,
  Inbox,
  Info,
  Keyboard,
  Layers,
  LayoutPanelTop,
  LayoutTemplate,
  LineChart,
  Link2,
  List,
  ListChecks,
  ListFilter,
  LoaderCircle,
  LogIn,
  MapPin,
  Maximize2,
  Menu,
  MessageCircle,
  MessageSquare,
  MessagesSquare,
  Minus,
  MoreHorizontal,
  MousePointerClick,
  Navigation,
  Paperclip,
  PanelBottom,
  PanelLeft,
  PanelRight,
  PieChart,
  Radar,
  RectangleHorizontal,
  ScanSearch,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Square,
  SquareDashed,
  StretchHorizontal,
  Table,
  Table2,
  Tag,
  TextCursorInput,
  ToggleLeft,
  Type,
  UnfoldVertical,
  Upload,
  User,
  type LucideIcon,
} from "lucide-react";
import { CHART_IDS } from "../catalog/chart-list";

function iconForChart(id: string): LucideIcon {
  if (id.startsWith("chart.area-")) return AreaChart;
  if (id.startsWith("chart.bar-")) return BarChart3;
  if (id.startsWith("chart.line-")) return LineChart;
  if (id.startsWith("chart.pie-")) return PieChart;
  if (id.startsWith("chart.radar-")) return Radar;
  if (id.startsWith("chart.radial-")) return Gauge;
  return Info;
}

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
  ...Object.fromEntries(CHART_IDS.map((id) => [id, iconForChart(id)])),
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

/** shadcn Charts glyph: tiny area sparkline. */
export function ChartSidebarIcon({
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
      <path d="M4 19V6" />
      <path d="M4 19h16" />
      <path d="M7 15c2-4 4-6 6-4s3 1 4-3" />
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
