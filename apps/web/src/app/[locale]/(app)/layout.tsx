import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import Header from "@/app-shell/Header";
import LeftSidebar from "@/app-shell/LeftSidebar";
import CenterStage from "@/app-shell/CenterStage";
import RightSidebar from "@/app-shell/RightSidebar";
import GlobalSearch from "@/app-shell/GlobalSearch";
import { ModalAgentChatPanel } from "@/features/agent/components/ModalAgentChatPanel";
import Footer from "@/app-shell/Footer";
import { HostedBootstrapBoundary } from "@/app-shell/HostedAppShellGate";
import { PanelLayout } from "@/app-shell/PanelLayout";
import { DocumentTitle } from "@/app-shell/DocumentTitle";
import { SidebarLayoutProvider } from "@/app-shell/SidebarLayoutContext";
import { WorkspaceCreationOverlay } from "@/app-shell/WorkspaceCreationOverlay";
import { CanvasOverlay } from "@/features/canvas/components/CanvasOverlay";
import { ConnectionBootstrapper } from "@/app-shell/bootstrap/ConnectionBootstrapper";
import { DiffWorkerPoolProvider } from "@/features/diff/components/DiffWorkerPoolProvider";

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
          <DiffWorkerPoolProvider>
          <ConnectionBootstrapper />
          <HostedBootstrapBoundary>
            <Header />

            <PanelLayout
              leftSidebar={<LeftSidebar />}
              centerStage={<CenterStage />}
              rightSidebar={<RightSidebar />}
            />

            <Footer />

            <GlobalSearch />

            <ModalAgentChatPanel />

            <DocumentTitle />

            <WorkspaceCreationOverlay />

            <CanvasOverlay />
          </HostedBootstrapBoundary>
          </DiffWorkerPoolProvider>
        </SidebarLayoutProvider>
      </Suspense>

      {/* Pages are thin route markers (return null) — required by Next.js layout contract */}
      {children}
    </div>
  );
}
