"use client";

import React from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckSquare,
  Code,
  CommandGroup,
  CommandInputWithoutBorder,
  CommandList,
  CornerDownLeft,
  File,
  GitCommit,
  Gauge,
  Layers,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tabs,
  TabsList,
  TabsTab,
} from "@workspace/ui";
import type { SearchMatch } from "@/api/ws-api";
import type { Task } from "@/features/workspace/hooks/use-workspace-context";
import { TaskListPanel } from "@/features/workspace/components/TaskListPanel";
import { CommitActionsContainer } from "@/app-shell/sidebar/CommitActionsContainer";
import { QuotaPopover } from "@/app-shell/QuotaPopover";
import {
  CodePreviewTooltip,
  CodeSearchResultItem,
  SearchItem,
  type AppSearchItem,
  type SearchTab,
} from "@/app-shell/global-search-parts";
import { useTranslations } from "next-intl";

type SubView = "todo" | "commit" | "usage";

interface SearchProjectSummary {
  id: string;
  name: string;
}

interface SearchWorkspaceSummary {
  id: string;
  name: string;
  localPath?: string | null;
}

interface GlobalSearchSubViewFrameProps {
  icon: React.ReactNode;
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}

function GlobalSearchSubViewFrame({
  icon,
  title,
  onBack,
  children,
}: GlobalSearchSubViewFrameProps) {
  const t = useTranslations("appShell");
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <button
          onClick={onBack}
          className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {icon}
          <span className="truncate text-sm font-semibold">{title}</span>
        </div>
      </div>

      {children}

      <div className="mt-auto flex h-[38px] shrink-0 select-none items-center justify-end border-t border-border/40 bg-transparent px-4 text-[11px] text-muted-foreground/80">
        <span className="flex items-center gap-1.5 opacity-80">
          <kbd className="flex h-[18px] items-center justify-center rounded border border-border/60 bg-background px-1.5 font-sans text-[10px] font-medium uppercase shadow-sm">Esc</kbd>
          <span>{t("globalSearch.back")}</span>
        </span>
      </div>
    </div>
  );
}

interface TodoSubViewProps {
  currentProject?: SearchProjectSummary;
  currentWorkspace?: SearchWorkspaceSummary;
  currentEffectivePath?: string | null;
  tasks: Task[];
  tasksLoading: boolean;
  addTask: (path: string, content: string) => Promise<void>;
  updateTaskStatus: Parameters<typeof TaskListPanel>[0]["updateTaskStatus"];
  updateTaskContent: Parameters<typeof TaskListPanel>[0]["updateTaskContent"];
  deleteTask: Parameters<typeof TaskListPanel>[0]["deleteTask"];
  onBack: () => void;
}

export function TodoSubView({
  currentProject,
  currentWorkspace,
  currentEffectivePath,
  tasks,
  tasksLoading,
  addTask,
  updateTaskStatus,
  updateTaskContent,
  deleteTask,
  onBack,
}: TodoSubViewProps) {
  const t = useTranslations("appShell");
  const completedCount = tasks.filter((task) => task.status === "done").length;
  const progressWidth = tasks.length > 0 ? `${(completedCount / tasks.length) * 100}%` : "0%";

  return (
    <GlobalSearchSubViewFrame
      icon={<CheckSquare className="size-4 shrink-0 text-muted-foreground" />}
      title={currentWorkspace?.name || currentProject?.name || t("globalSearch.fallback.tasks")}
      onBack={onBack}
    >
      <div className="min-h-0 flex-1 overflow-hidden">
        <Card className="flex h-full flex-col rounded-none border-0 bg-background">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border px-4 py-3">
            <CardTitle className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <CheckSquare className="size-4" />
              {t("globalSearch.tasks")}
            </CardTitle>
            <div className="flex items-center gap-2.5">
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-foreground transition-all duration-300"
                  style={{ width: progressWidth }}
                />
              </div>
              <span className="font-mono text-[11px] text-muted-foreground">
                {completedCount}/{tasks.length}
              </span>
            </div>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden p-0">
            <TaskListPanel
              tasks={tasks}
              tasksLoading={tasksLoading}
              effectivePath={currentEffectivePath || ""}
              addTask={addTask}
              updateTaskStatus={updateTaskStatus}
              updateTaskContent={updateTaskContent}
              deleteTask={deleteTask}
            />
          </CardContent>
        </Card>
      </div>
    </GlobalSearchSubViewFrame>
  );
}

interface CommitSubViewProps {
  currentProject?: SearchProjectSummary;
  currentWorkspace?: SearchWorkspaceSummary;
  currentEffectivePath?: string | null;
  projectId?: string | null;
  workspaceId?: string | null;
  onBack: () => void;
}

export function CommitSubView({
  currentProject,
  currentWorkspace,
  currentEffectivePath,
  projectId,
  workspaceId,
  onBack,
}: CommitSubViewProps) {
  const t = useTranslations("appShell");
  return (
    <GlobalSearchSubViewFrame
      icon={<GitCommit className="size-4 shrink-0 text-muted-foreground" />}
      title={t("globalSearch.fallback.commit")}
      onBack={onBack}
    >
      <div className="min-h-0 flex-1 overflow-hidden">
        <CommitActionsContainer
          variant="panel"
          currentProjectPath={currentEffectivePath ?? null}
          currentProject={currentProject}
          currentWorkspace={currentWorkspace}
          workspaceId={workspaceId}
          projectId={projectId}
          className="h-full rounded-none border-0"
        />
      </div>
    </GlobalSearchSubViewFrame>
  );
}

interface UsageSubViewProps {
  onBack: () => void;
}

export function UsageSubView({ onBack }: UsageSubViewProps) {
  const t = useTranslations("appShell");
  return (
    <GlobalSearchSubViewFrame
      icon={<Gauge className="size-4 shrink-0 text-muted-foreground" />}
      title={t("globalSearch.fallback.usage")}
      onBack={onBack}
    >
      <div className="min-h-0 flex-1 overflow-hidden">
        <QuotaPopover embedded />
      </div>
    </GlobalSearchSubViewFrame>
  );
}

interface FileSearchItem {
  name: string;
  path: string;
  isDir: boolean;
}

type GroupedAppItems = Record<AppSearchItem["type"], AppSearchItem[]>;

interface GlobalSearchMainViewProps {
  codeSearchResults: SearchMatch[];
  codeSearchTruncated: boolean;
  currentEffectivePath?: string | null;
  currentProject?: SearchProjectSummary;
  filteredAppItems: AppSearchItem[];
  filteredFiles: FileSearchItem[];
  globalSearchTab: SearchTab;
  groupedAppItems: GroupedAppItems;
  hoveredValue: string | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  isLoadingFiles: boolean;
  isSearchingCode: boolean;
  searchQuery: string;
  selectedValue: string;
  setGlobalSearchTab: (tab: SearchTab) => void;
  setHoveredValue: (value: string | null) => void;
  setSearchQuery: (query: string) => void;
  onCodeResultSelect: (match: SearchMatch) => void;
  onFileSelect: (path: string) => void;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[300px] w-full flex-col items-center justify-center text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function AppSearchResults({
  filteredAppItems,
  groupedAppItems,
  searchQuery,
}: Pick<GlobalSearchMainViewProps, "filteredAppItems" | "groupedAppItems" | "searchQuery">) {
  const t = useTranslations("appShell");
  const appGroups: Array<{ key: AppSearchItem["type"]; heading: string; showDescription?: boolean }> = [
    { key: "workspace", heading: t("globalSearch.groups.workspace"), showDescription: true },
    { key: "theme", heading: t("globalSearch.groups.theme") },
    { key: "project", heading: t("globalSearch.groups.project") },
    { key: "launchpad", heading: t("globalSearch.groups.launchpad"), showDescription: true },
    { key: "modal", heading: t("globalSearch.groups.modal"), showDescription: true },
    { key: "todo", heading: t("globalSearch.groups.todo") },
    { key: "commit", heading: t("globalSearch.groups.commit"), showDescription: true },
    { key: "usage", heading: t("globalSearch.groups.usage"), showDescription: true },
    { key: "new-workspace", heading: t("globalSearch.groups.newWorkspace"), showDescription: true },
    { key: "quick-open", heading: t("globalSearch.groups.quickOpen"), showDescription: true },
  ];

  if (filteredAppItems.length === 0) {
    return <EmptyState>{t("globalSearch.noResults")}</EmptyState>;
  }

  return (
    <>
      {appGroups.map(({ key, heading, showDescription }) => (
        groupedAppItems[key].length > 0 ? (
          <CommandGroup key={key} heading={heading}>
            {groupedAppItems[key].map((item) => (
              <SearchItem
                key={item.id}
                value={item.id}
                onSelect={item.action}
                icon={item.icon}
                title={item.title}
                description={showDescription ? item.description : undefined}
                highlightQuery={searchQuery}
                shortcut={item.shortcut}
                contextId={item.contextId}
                githubPr={item.githubPr}
                branch={item.branch}
              />
            ))}
          </CommandGroup>
        ) : null
      ))}
    </>
  );
}

function FileSearchResults({
  currentEffectivePath,
  currentProject,
  filteredFiles,
  isLoadingFiles,
  onFileSelect,
}: Pick<GlobalSearchMainViewProps, "currentEffectivePath" | "currentProject" | "filteredFiles" | "isLoadingFiles" | "onFileSelect">) {
  const t = useTranslations("appShell");
  if (!currentProject) {
    return <EmptyState>{t("globalSearch.selectWorkspaceForFiles")}</EmptyState>;
  }

  if (isLoadingFiles) {
    return <EmptyState>{t("globalSearch.loadingFiles")}</EmptyState>;
  }

  if (filteredFiles.length === 0) {
    return <EmptyState>{t("globalSearch.noFilesFound")}</EmptyState>;
  }

  return (
    <CommandGroup heading={t("globalSearch.groups.files")}>
      {filteredFiles.map((file) => (
        <SearchItem
          key={file.path}
          value={file.path}
          onSelect={() => onFileSelect(file.path)}
          title={file.name}
          description={file.path.replace(`${currentEffectivePath}/`, "")}
          isDir={file.isDir}
          shortcut={t("globalSearch.open")}
        />
      ))}
    </CommandGroup>
  );
}

function CodeSearchResults({
  codeSearchResults,
  codeSearchTruncated,
  currentProject,
  isSearchingCode,
  searchQuery,
  setHoveredValue,
  onCodeResultSelect,
}: Pick<GlobalSearchMainViewProps, "codeSearchResults" | "codeSearchTruncated" | "currentProject" | "isSearchingCode" | "searchQuery" | "setHoveredValue" | "onCodeResultSelect">) {
  const t = useTranslations("appShell");
  if (!currentProject) {
    return <EmptyState>{t("globalSearch.selectWorkspaceForCode")}</EmptyState>;
  }

  if (!searchQuery.trim()) {
    return <EmptyState>{t("globalSearch.typeToSearch")}</EmptyState>;
  }

  if (isSearchingCode) {
    return <EmptyState>{t("globalSearch.searching")}</EmptyState>;
  }

  if (codeSearchResults.length === 0) {
    return <EmptyState>{t("globalSearch.noMatches")}</EmptyState>;
  }

  return (
    <CommandGroup heading={codeSearchTruncated ? t("globalSearch.resultsTruncated") : t("globalSearch.results")}>
      {codeSearchResults.map((match, index) => (
        <CodeSearchResultItem
          key={`${match.file_path}-${match.line_number}-${index}`}
          match={match}
          onHover={setHoveredValue}
          onSelect={() => onCodeResultSelect(match)}
        />
      ))}
    </CommandGroup>
  );
}

function GlobalSearchFooter() {
  const t = useTranslations("appShell");
  return (
    <div className="mt-auto flex h-[38px] shrink-0 select-none items-center justify-between border-t border-border/40 bg-transparent px-4 text-[11px] text-muted-foreground/80">
      <div className="flex items-center gap-5">
        <span className="group flex items-center gap-1.5">
          <div className="flex items-center gap-0.5">
            <kbd className="flex h-[18px] min-w-[18px] items-center justify-center rounded border border-border/60 bg-background font-sans text-[10px] shadow-sm">
              <ArrowUp className="size-2.5" />
            </kbd>
            <kbd className="flex h-[18px] min-w-[18px] items-center justify-center rounded border border-border/60 bg-background font-sans text-[10px] shadow-sm">
              <ArrowDown className="size-2.5" />
            </kbd>
          </div>
          <span className="opacity-80">{t("globalSearch.navigate")}</span>
        </span>
        <span className="flex cursor-default items-center gap-1.5 rounded-md px-2 py-0.5 hover:bg-muted">
          <kbd className="flex h-[18px] min-w-[20px] items-center justify-center rounded border border-border/60 bg-background font-sans text-[10px] shadow-sm">
            <CornerDownLeft className="size-2.5" />
          </kbd>
          <span className="opacity-80">{t("globalSearch.openResult")}</span>
        </span>
      </div>
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5 opacity-80">
          <kbd className="flex h-[18px] items-center justify-center rounded border border-border/60 bg-background px-1.5 font-sans text-[10px] font-medium uppercase shadow-sm">Esc</kbd>
          <span>{t("globalSearch.close")}</span>
        </span>
      </div>
    </div>
  );
}

export function GlobalSearchMainView({
  codeSearchResults,
  codeSearchTruncated,
  currentEffectivePath,
  currentProject,
  filteredAppItems,
  filteredFiles,
  globalSearchTab,
  groupedAppItems,
  hoveredValue,
  inputRef,
  isLoadingFiles,
  isSearchingCode,
  searchQuery,
  selectedValue,
  setGlobalSearchTab,
  setHoveredValue,
  setSearchQuery,
  onCodeResultSelect,
  onFileSelect,
}: GlobalSearchMainViewProps) {
  const t = useTranslations("appShell");
  return (
    <>
      <CodePreviewTooltip
        codeSearchResults={codeSearchResults}
        globalSearchTab={globalSearchTab}
        hoveredValue={hoveredValue}
        selectedValue={selectedValue}
      />
      <div className="px-1">
        <Tabs value={globalSearchTab} onValueChange={(value) => setGlobalSearchTab(value as SearchTab)} className="h-full w-full">
          <TabsList variant="underline" className="flex h-12 w-full border-b border-border">
            <TabsTab value="app" className="flex h-full flex-1 gap-2 text-[12px] font-semibold transition-all">
              <Layers className="size-3.5" />
              <span>{t("globalSearch.tabs.app")}</span>
            </TabsTab>
            <TabsTab value="files" className="flex h-full flex-1 gap-2 text-[12px] font-semibold transition-all">
              <File className="size-3.5" />
              <span>{t("globalSearch.tabs.files")}</span>
            </TabsTab>
            <TabsTab value="code" className="flex h-full flex-1 gap-2 text-[12px] font-semibold transition-all">
              <Code className="size-3.5" />
              <span>{t("globalSearch.tabs.code")}</span>
            </TabsTab>
          </TabsList>
        </Tabs>
      </div>

      <CommandInputWithoutBorder
        ref={inputRef}
        placeholder={t("globalSearch.placeholder")}
        value={searchQuery}
        onValueChange={setSearchQuery}
        className="text-base"
      />

      <CommandList className="h-full max-h-none flex-1 rounded-t-[20px] bg-muted/50 pt-1 shadow-inner/5 dark:bg-black/60">
        {globalSearchTab === "app" ? (
          <AppSearchResults
            filteredAppItems={filteredAppItems}
            groupedAppItems={groupedAppItems}
            searchQuery={searchQuery}
          />
        ) : null}
        {globalSearchTab === "files" ? (
          <FileSearchResults
            currentEffectivePath={currentEffectivePath}
            currentProject={currentProject}
            filteredFiles={filteredFiles}
            isLoadingFiles={isLoadingFiles}
            onFileSelect={onFileSelect}
          />
        ) : null}
        {globalSearchTab === "code" ? (
          <CodeSearchResults
            codeSearchResults={codeSearchResults}
            codeSearchTruncated={codeSearchTruncated}
            currentProject={currentProject}
            isSearchingCode={isSearchingCode}
            searchQuery={searchQuery}
            setHoveredValue={setHoveredValue}
            onCodeResultSelect={onCodeResultSelect}
          />
        ) : null}
      </CommandList>
      <GlobalSearchFooter />
    </>
  );
}

export type { GroupedAppItems, SubView };
