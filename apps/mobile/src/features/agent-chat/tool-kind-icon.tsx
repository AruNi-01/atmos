import type { AgentToolKind } from "@atmos/api-types/ws/dto/agent-chat";
import {
  BotMessageSquareIcon,
  FileTextIcon,
  FolderInputIcon,
  GlobeIcon,
  ImageIcon,
  PencilIcon,
  PlugIcon,
  SearchIcon,
  SparklesIcon,
  TerminalIcon,
  TrashIcon,
  WrenchIcon,
} from "@/ui/icons/lucide-native";

/** Same kind map as web `getToolKindIcon`. */
export function ToolKindIcon({
  color,
  kind,
  size,
}: {
  color: string;
  kind: AgentToolKind;
  size: number;
}) {
  const props = { color, size, strokeWidth: 2 };
  switch (kind) {
    case "read":
    case "plan_document":
      return <FileTextIcon {...props} />;
    case "edit":
      return <PencilIcon {...props} />;
    case "delete":
      return <TrashIcon {...props} />;
    case "move":
      return <FolderInputIcon {...props} />;
    case "search":
    case "web_search":
      return <SearchIcon {...props} />;
    case "execute":
      return <TerminalIcon {...props} />;
    case "fetch":
      return <GlobeIcon {...props} />;
    case "skill":
      return <SparklesIcon {...props} />;
    case "subagent":
      return <BotMessageSquareIcon {...props} />;
    case "mcp_list":
    case "mcp_call":
      return <PlugIcon {...props} />;
    case "image_gen":
      return <ImageIcon {...props} />;
    default:
      return <WrenchIcon {...props} />;
  }
}
