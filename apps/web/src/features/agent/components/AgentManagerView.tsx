"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useQueryStates } from "nuqs";
import { agentManagerParams, type AgentManagerView as AgentManagerMode, type AgentTab } from "@/shared/lib/nuqs/searchParams";
import {
  Button,
  Input,
  Tabs,
  TabsContent,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@workspace/ui";
import type { CustomAgent } from "@/api/ws-api";
import {
  Bot,
  Search,
  LoaderCircle,
  RotateCcw,
  Plus,
  Terminal,
  Download,
  Globe,
  MessageSquare,
} from "lucide-react";
import { LaunchpadPageTabs } from "@/shared/components/LaunchpadPageTabs";
import { ChatSessionsManagementView } from "@/features/chat-sessions/components/ChatSessionsManagementView";
import { motion, AnimatePresence } from "motion/react";
import {
  AgentCard,
  CustomAgentCard,
  AgentEmptyState,
  AgentSkeletonGrid,
} from "./agent-manager-cards";
import { useAgentManager } from "../hooks/use-agent-manager";
import { CustomAgentDialog } from "./CustomAgentDialog";
import { AgentConfirmDialogs } from "./AgentConfirmDialogs";

export const AgentManagerView: React.FC = () => {
  const t = useTranslations("Agent.components");
  const [{ agentView, agentTab: activeTab, agentQ: query }, setAgentParams] = useQueryStates(agentManagerParams);
  const [iconHovered, setIconHovered] = React.useState(false);
  const [addCustomDialogOpen, setAddCustomDialogOpen] = React.useState(false);
  const [editingCustomAgent, setEditingCustomAgent] = React.useState<CustomAgent | null>(null);

  const mgr = useAgentManager(query);

  const openAddCustomDialog = React.useCallback(() => {
    setEditingCustomAgent(null);
    setAddCustomDialogOpen(true);
  }, []);

  const openEditCustomDialog = React.useCallback((agent: CustomAgent) => {
    setEditingCustomAgent(agent);
    setAddCustomDialogOpen(true);
  }, []);

  const handleCustomDialogSaved = React.useCallback(() => {
    void mgr.loadData();
  }, [mgr]);

  const handleClearSearch = React.useCallback(() => {
    void setAgentParams({ agentQ: "" });
  }, [setAgentParams]);

  const isSessionsView = agentView === "sessions";
  const handleViewChange = React.useCallback(() => {
    const nextView: AgentManagerMode = isSessionsView ? "manager" : "sessions";
    void setAgentParams({ agentView: nextView });
  }, [isSessionsView, setAgentParams]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div
        className="sticky top-0 z-10 cursor-pointer bg-background/50 px-8 py-6 backdrop-blur-sm"
        onMouseEnter={() => setIconHovered(true)}
        onMouseLeave={() => setIconHovered(false)}
        onClick={handleViewChange}
      >
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <div className="flex items-start justify-between gap-6">
          <div className="flex min-w-0 items-center gap-4 shrink-0">
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="relative flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20 overflow-hidden"
                    aria-label={isSessionsView
                      ? t("manager.switchToAgentManager")
                      : t("manager.switchToSessions")}
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      {(isSessionsView !== iconHovered) ? (
                        <motion.div
                          key="sessions-icon"
                          initial={{ y: 12, opacity: 0, scale: 0.85 }}
                          animate={{ y: 0, opacity: 1, scale: 1 }}
                          exit={{ y: -12, opacity: 0, scale: 0.85 }}
                          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                          className="absolute inset-0 flex items-center justify-center"
                        >
                          <MessageSquare className="size-6" />
                        </motion.div>
                      ) : (
                        <motion.div
                          key="agents-icon"
                          initial={{ y: 12, opacity: 0, scale: 0.85 }}
                          animate={{ y: 0, opacity: 1, scale: 1 }}
                          exit={{ y: -12, opacity: 0, scale: 0.85 }}
                          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                          className="absolute inset-0 flex items-center justify-center"
                        >
                          <Bot className="size-6" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {isSessionsView ? t("manager.switchToAgentManager") : t("manager.switchToSessions")}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div className="relative overflow-hidden">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={isSessionsView ? "sessions-title" : "agents-title"}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -20, opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                >
                  <h2 className="text-xl font-bold tracking-tight text-foreground text-balance">
                    {isSessionsView ? t("manager.sessionsTitle") : t("manager.agentsTitle")}
                  </h2>
                  <p className="text-sm text-muted-foreground text-pretty max-w-xs">
                    {isSessionsView
                      ? t("manager.sessionsDescription")
                      : t("manager.agentsDescription")}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {!isSessionsView ? (
            <div onClick={(event) => event.stopPropagation()}>
              <LaunchpadPageTabs
                value={activeTab}
                onValueChange={(value) => void setAgentParams({ agentTab: value as AgentTab })}
                items={[
                  { value: "registry", label: t("manager.tabs.registry"), icon: Globe },
                  { value: "installed", label: t("manager.tabs.installed"), icon: Download },
                  { value: "custom", label: t("manager.tabs.custom"), icon: Terminal },
                ]}
              />
            </div>
          ) : null}
        </div>

          {!isSessionsView ? (
            <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                <div className="relative min-w-0 flex-1 group">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60 group-focus-within:text-primary transition-colors" />
                  <Input
                    value={query}
                    onChange={(e) => setAgentParams({ agentQ: e.target.value })}
                    placeholder={t("manager.searchPlaceholder")}
                    className="h-11 pl-10 bg-muted/20 border-border/50 focus:bg-background transition-all rounded-xl shadow-sm focus-visible:ring-1 focus-visible:ring-primary/20"
                  />
                </div>
                {activeTab === "custom" && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={openAddCustomDialog}
                    className="size-11 shrink-0 rounded-xl bg-muted/20 border-border/50 hover:bg-background transition-all shadow-sm"
                    title={t("manager.addCustomAgent")}
                  >
                    <Plus className="size-4" />
                  </Button>
                )}
                {activeTab === "registry" && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => mgr.handleRefresh()}
                    disabled={mgr.refreshing}
                    className="size-11 shrink-0 rounded-xl bg-muted/20 border-border/50 hover:bg-background transition-all shadow-sm"
                    title={t("manager.refreshRegistry")}
                  >
                    {mgr.refreshing ? <LoaderCircle className="size-4 animate-spin-reverse" /> : <RotateCcw className="size-4" />}
                  </Button>
                )}
            </div>
          ) : null}
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {isSessionsView ? (
          <motion.div
            key="sessions-content"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="flex-1 overflow-hidden"
          >
            <ChatSessionsManagementView hideHeader />
          </motion.div>
        ) : (
          <motion.div
            key="agents-content"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="flex-1 flex flex-col overflow-hidden"
          >
      <Tabs
        value={activeTab}
        onValueChange={(v) => setAgentParams({ agentTab: v as AgentTab })}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <div className="flex-1 scrollbar-on-hover overflow-auto px-8 pt-4 pb-8">
          <div className="max-w-5xl mx-auto w-full">
            <TabsContent keepMounted value="registry">
              {mgr.loading ? <AgentSkeletonGrid /> : (
                <>
                  {mgr.filteredRegistry.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <AnimatePresence mode="popLayout" initial={false}>
                        {mgr.filteredRegistry.map((item, index) => (
                          <AgentCard
                            key={item.id}
                            item={item}
                            index={index}
                            installingRegistryIds={mgr.installingRegistryIds}
                            removingRegistryId={mgr.removingRegistryId}
                            onInstall={mgr.handleInstallRegistry}
                            onRemoveRequest={mgr.setRemoveConfirmDialog}
                          />
                        ))}
                      </AnimatePresence>
                    </div>
                  ) : (
                    <AgentEmptyState
                      message={
                        query
                          ? t("manager.empty.registryQuery", { query })
                          : t("manager.empty.registryDefault")
                      }
                      query={query}
                      onClearSearch={handleClearSearch}
                    />
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent keepMounted value="installed">
              {mgr.loading ? <AgentSkeletonGrid /> : (
                <>
                  {mgr.installedAgents.length > 0 || mgr.filteredCustomAgents.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <AnimatePresence mode="popLayout" initial={false}>
                        {mgr.installedAgents.map((item, index) => (
                          <AgentCard
                            key={item.id}
                            item={item}
                            index={index}
                            installingRegistryIds={mgr.installingRegistryIds}
                            removingRegistryId={mgr.removingRegistryId}
                            onInstall={mgr.handleInstallRegistry}
                            onRemoveRequest={mgr.setRemoveConfirmDialog}
                          />
                        ))}
                        {mgr.filteredCustomAgents.map((agent, index) => (
                          <CustomAgentCard
                            key={`custom-${agent.name}`}
                            agent={agent}
                            index={mgr.installedAgents.length + index}
                            removingCustomName={mgr.removingCustomName}
                            onEdit={openEditCustomDialog}
                            onRemoveRequest={mgr.setRemoveCustomConfirmDialog}
                          />
                        ))}
                      </AnimatePresence>
                    </div>
                  ) : (
                    <AgentEmptyState
                      message={
                        query
                          ? t("manager.empty.installedQuery", { query })
                          : t("manager.empty.installedDefault")
                      }
                      query={query}
                      onClearSearch={handleClearSearch}
                    />
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent keepMounted value="custom">
              {mgr.loading ? <AgentSkeletonGrid /> : (
                <>
                  {mgr.customAgents.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <AnimatePresence mode="popLayout" initial={false}>
                        {mgr.customAgents.map((agent, index) => (
                          <CustomAgentCard
                            key={`custom-${agent.name}`}
                            agent={agent}
                            index={index}
                            removingCustomName={mgr.removingCustomName}
                            onEdit={openEditCustomDialog}
                            onRemoveRequest={mgr.setRemoveCustomConfirmDialog}
                          />
                        ))}
                      </AnimatePresence>
                    </div>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex flex-col items-center justify-center py-24 text-center"
                    >
                      <div className="size-16 rounded-3xl bg-muted/20 flex items-center justify-center mb-4">
                        <Terminal className="size-8 text-muted-foreground/30" />
                      </div>
                      <h3 className="text-base font-medium text-foreground">{t("manager.customEmpty.title")}</h3>
                      <p className="mt-1 text-sm text-muted-foreground max-w-[280px] text-pretty">
                        {t("manager.customEmpty.description")}
                      </p>
                      <Button
                        variant="outline"
                        onClick={openAddCustomDialog}
                        className="mt-4 cursor-pointer"
                      >
                        <Plus className="mr-1.5 size-4" />
                        {t("manager.addCustomAgent")}
                      </Button>
                    </motion.div>
                  )}
                </>
              )}
            </TabsContent>
          </div>
        </div>
      </Tabs>
          </motion.div>
        )}
      </AnimatePresence>

      <AgentConfirmDialogs
        overwriteDialog={mgr.overwriteDialog}
        onConfirmOverwrite={() => void mgr.handleConfirmOverwrite()}
        onCancelOverwrite={mgr.cancelOverwrite}
        removeConfirmDialog={mgr.removeConfirmDialog}
        onConfirmRemove={() => mgr.removeConfirmDialog && void mgr.handleRemoveRegistry(mgr.removeConfirmDialog.registryId)}
        onCancelRemove={mgr.cancelRemoveRegistry}
        removeCustomConfirmDialog={mgr.removeCustomConfirmDialog}
        onConfirmRemoveCustom={() => mgr.removeCustomConfirmDialog && void mgr.handleRemoveCustomAgent(mgr.removeCustomConfirmDialog.name)}
        onCancelRemoveCustom={mgr.cancelRemoveCustom}
      />

      <CustomAgentDialog
        open={addCustomDialogOpen}
        onOpenChange={setAddCustomDialogOpen}
        editingAgent={editingCustomAgent}
        onSaved={handleCustomDialogSaved}
      />
    </div>
  );
};
