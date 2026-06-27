import { setRequestLocale } from "next-intl/server";
import { AgentChatStandalonePage } from "@/features/agent/components/AgentChatStandalonePage";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function AgentChatPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AgentChatStandalonePage />;
}
