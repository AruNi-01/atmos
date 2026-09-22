import { EmptyAction, IconArrowRight, IconCategory, IconSearch, TabsContent } from "@workspace/ui";
import { useTranslations } from "next-intl";
import type { SkillInfo } from "@/api/ws-api";
import { AnimatePresence, motion } from "motion/react";
import { SkillsSkeletonGrid } from "./SkillsViewEmptyState";
import { InstalledSkillListCard } from "./InstalledSkillListCard";
import { PageEmptyState } from "@/shared/components/PageEmptyState";

export function SkillsInstalledTab({
  isLoading,
  skills,
  filteredSkills,
  query,
  isFilterActive,
  onResetFilters,
  onBrowseMarket,
  onOpenSkill,
  onSkillUpdated,
  onSkillDeleted,
}: {
  isLoading: boolean;
  skills: SkillInfo[];
  filteredSkills: SkillInfo[];
  query: string;
  isFilterActive: boolean;
  onResetFilters: () => void;
  onBrowseMarket: () => void;
  onOpenSkill: (skill: SkillInfo) => void;
  onSkillUpdated: (skill: SkillInfo) => void | Promise<void>;
  onSkillDeleted: (skillId: string) => void | Promise<void>;
}) {
  const t = useTranslations("skills.installedTab");
  const noneInstalled = skills.length === 0;
  const narrowing = Boolean(query.trim()) || isFilterActive;

  return (
    <TabsContent keepMounted value="installed">
      {isLoading ? (
        <SkillsSkeletonGrid />
      ) : filteredSkills.length === 0 ? (
        <PageEmptyState
          icon={noneInstalled ? <IconCategory /> : <IconSearch />}
          title={
            noneInstalled ? t("empty.noneInstalledTitle") : t("empty.noMatchesTitle")
          }
          description={
            noneInstalled
              ? t("empty.noneInstalledDescription")
              : query.trim()
                ? t("empty.noMatchesDescription", { query: query.trim() })
                : t("empty.noFilterMatches")
          }
          actions={
            noneInstalled ? (
              <EmptyAction trailing={<IconArrowRight />} onClick={onBrowseMarket}>
                {t("empty.browseMarket")}
              </EmptyAction>
            ) : narrowing ? (
              <EmptyAction emphasis="quiet" onClick={onResetFilters}>
                {isFilterActive ? t("empty.resetFilters") : t("empty.clearSearch")}
              </EmptyAction>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-5 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
          <AnimatePresence mode="popLayout" initial={false}>
            {filteredSkills.map((skill, index) => (
              <motion.div
                key={skill.path}
                className="h-full"
                layout
                initial={{ opacity: 0, y: 10, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.94 }}
                transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.24), ease: "easeOut" }}
              >
                <InstalledSkillListCard
                  skill={skill}
                  onClick={() => onOpenSkill(skill)}
                  onUpdated={onSkillUpdated}
                  onDeleted={onSkillDeleted}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </TabsContent>
  );
}
