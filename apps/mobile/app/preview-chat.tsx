import { useEffect } from "react";
import { PreviewChatScreen } from "@/features/agent-chat/preview-chat-screen";

if (process.env.EXPO_PUBLIC_PARITY_PREVIEW === "1") {
  console.error("[parity] preview-chat module");
}

export default function PreviewChatRoute() {
  useEffect(() => {
    if (process.env.EXPO_PUBLIC_PARITY_PREVIEW !== "1") return;
    console.error("[parity] preview-chat route");
  }, []);
  if (process.env.EXPO_PUBLIC_PARITY_PREVIEW !== "1") return null;
  return <PreviewChatScreen />;
}
