"use client";

// UI Components
export * from "./components/ui/button";
export * from "./components/ui/card";
export * from "./components/ui/checkbox";
export * from "./components/ui/input";
export * from "./components/ui/input-group";
export * from "./components/ui/label";
export * from "./components/ui/dialog";
export * from "./components/ui/scroll-area";
export * from "./components/ui/select";
export * from "./components/ui/toast";
export * from "./components/theme-toggle";
export * from "./components/language-selector";
export * from "./components/ui/dropdown-menu";
export * from "./components/ui/popover";
export * from "./components/ui/tabs";
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
export * from "./components/ui/tooltip";
export * from "./components/ui/toggle-group";
export * from "./components/ui/skeleton";
export * from "./components/ui/preview-card";
export * from "./components/logo-svg";
export * from "./components/ui/avatar";
export { Badge, badgeVariants } from "./components/ui/badge";
export * from "./components/ui/craft-button";
export * from "./components/ui/marquee";
export * from "./components/ui/motion-preset";
export * from "./components/ui/navigation-menu";
export * from "./components/ui/rating";
export * from "./components/ui/separator";
export * from "./components/ui/switch";
export * from "./components/ui/accordion";
export * from "./components/ui/flow-button";
export * from "./components/ui/border-beam";
export { ShineBorder } from "./components/ui/shine-border";
export { TextShimmer } from "./components/ui/text-shimmer";
export { TextScramble } from "./components/ui/text-scramble";

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
