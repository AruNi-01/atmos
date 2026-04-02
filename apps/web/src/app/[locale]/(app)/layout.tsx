import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import Header from "@/components/layout/Header";
import LeftSidebar from "@/components/layout/LeftSidebar";
import CenterStage from "@/components/layout/CenterStage";
import RightSidebar from "@/components/layout/RightSidebar";
import GlobalSearch from "@/components/layout/GlobalSearch";
import { AgentChatPanel } from "@/components/agent/AgentChatPanel";
import Footer from "@/components/layout/Footer";
import { PanelLayout } from "@/components/layout/PanelLayout";
import { DocumentTitle } from "@/components/layout/DocumentTitle";
import { SidebarLayoutProvider } from "@/components/layout/SidebarLayoutContext";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function AppLayout({ children, params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="flex flex-col h-dvh">
      <Suspense
        fallback={
          <div className="flex flex-1 flex-col">
            <div className="flex h-12 items-center border-b border-border px-4">
              <div className="h-5 w-28 animate-pulse rounded bg-muted" />
            </div>
            <div className="flex flex-1">
              <div className="hidden w-56 border-r border-border p-3 md:block">
                <div className="space-y-2">
                  <div className="h-6 w-full animate-pulse rounded bg-muted" />
                  <div className="h-6 w-3/4 animate-pulse rounded bg-muted" />
                  <div className="h-6 w-5/6 animate-pulse rounded bg-muted" />
                </div>
              </div>
              <div className="flex flex-1 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-foreground" />
              </div>
            </div>
          </div>
        }
      >
        <SidebarLayoutProvider>
          <Header />

          <PanelLayout
            leftSidebar={<LeftSidebar />}
            centerStage={<CenterStage />}
            rightSidebar={<RightSidebar />}
          />

          <Footer />

          <GlobalSearch />

          <AgentChatPanel />

          <DocumentTitle />
        </SidebarLayoutProvider>
      </Suspense>

      {/* Pages are thin route markers (return null) — required by Next.js layout contract */}
      {children}
    </div>
  );
}
