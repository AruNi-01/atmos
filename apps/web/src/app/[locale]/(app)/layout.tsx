import { setRequestLocale } from "next-intl/server";
import Header from "@/components/layout/Header";
import LeftSidebar from "@/components/layout/LeftSidebar";
import CenterStage from "@/components/layout/CenterStage";
import RightSidebar from "@/components/layout/RightSidebar";
import GlobalSearch from "@/components/layout/GlobalSearch";
import { AgentChatPanel } from "@/components/agent/AgentChatPanel";
import { AgentFloatingBall } from "@/components/agent/AgentFloatingBall";
import { TERMINAL_LOGS } from "@/constants";
import Footer from "@/components/layout/Footer";
import { PanelLayout } from "@/components/layout/PanelLayout";
import { DocumentTitle } from "@/components/layout/DocumentTitle";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function AppLayout({ children, params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="flex flex-col h-dvh">
      <Header />

      <PanelLayout
        leftSidebar={<LeftSidebar />}
        centerStage={<CenterStage logs={TERMINAL_LOGS} />}
        rightSidebar={<RightSidebar />}
      />

      <Footer />

      <GlobalSearch />

      <AgentChatPanel />
      <AgentFloatingBall />

      <DocumentTitle />

      {/* Pages are thin route markers (return null) — required by Next.js layout contract */}
      {children}
    </div>
  );
}
