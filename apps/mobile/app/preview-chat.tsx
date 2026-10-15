import { PreviewChatScreen } from "@/features/agent-chat/preview-chat-screen";

export default function PreviewChatRoute() {
  if (process.env.EXPO_PUBLIC_PARITY_PREVIEW !== "1") return null;
  return <PreviewChatScreen />;
}
