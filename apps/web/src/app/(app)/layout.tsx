import { Suspense } from "react";
import { AppShellMain } from "@/app-shell/AppShellMain";
import GlobalSearch from "@/app-shell/GlobalSearch";
import { ModalAgentChatPanel } from "@/features/agent/components/ModalAgentChatPanel";
import { HostedBootstrapBoundary } from "@/app-shell/HostedAppShellGate";
import { DocumentTitle } from "@/app-shell/DocumentTitle";
import { SidebarLayoutProvider } from "@/app-shell/SidebarLayoutContext";
import { WorkspaceCreationOverlay } from "@/app-shell/WorkspaceCreationOverlay";
import { CanvasOverlay } from "@/features/canvas/components/CanvasOverlay";
import { ConnectionBootstrapper } from "@/app-shell/bootstrap/ConnectionBootstrapper";
import { DiffWorkerPoolProvider } from "@/features/diff/components/DiffWorkerPoolProvider";
import { OnboardingGate } from "@/app-shell/OnboardingGate";
import { E2eNavigateBridge } from "@/app-shell/E2eNavigateBridge";

type Props = {
  children: React.ReactNode;
};

export default function AppLayout({ children }: Props) {
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
              <OnboardingGate>
                <E2eNavigateBridge />
                <AppShellMain />

                <GlobalSearch />

                <ModalAgentChatPanel />

                <DocumentTitle />

                <WorkspaceCreationOverlay />

                <CanvasOverlay />
              </OnboardingGate>
            </HostedBootstrapBoundary>
          </DiffWorkerPoolProvider>
        </SidebarLayoutProvider>
      </Suspense>

      {/* Pages are thin route markers (return null) — required by Next.js layout contract */}
      {children}
    </div>
  );
}
