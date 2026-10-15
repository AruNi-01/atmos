import { PreviewChatScreen } from "@/features/agent-chat/preview-chat-screen";

if (process.env.EXPO_PUBLIC_PARITY_PREVIEW === "1") {
  console.log("[parity] preview-chat module");
}

export default function PreviewChatRoute() {
  if (process.env.EXPO_PUBLIC_PARITY_PREVIEW !== "1") return null;
  console.log("[parity] preview-chat route");
  return <PreviewChatScreen />;
}
