import { Button, TabsContent } from "@workspace/ui";
import type { SkillInfo } from "@/api/ws-api";
import { AnimatePresence, motion } from "motion/react";
import { Puzzle } from "lucide-react";
import { EmptyState, SkillsSkeletonGrid } from "./SkillsViewEmptyState";
import { InstalledSkillListCard } from "./InstalledSkillListCard";
import { INSTALLED_EMPTY_COPY } from "./skills-view-utils";

export function SkillsInstalledTab({
  isLoading,
  skills,
  filteredSkills,
  query,
  isFilterActive,
  onResetFilters,
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
  onOpenSkill: (skill: SkillInfo) => void;
  onSkillUpdated: (skill: SkillInfo) => void | Promise<void>;
  onSkillDeleted: (skillId: string) => void | Promise<void>;
}) {
  return (
    <TabsContent keepMounted value="installed">
      {isLoading ? (
        <SkillsSkeletonGrid />
      ) : filteredSkills.length === 0 ? (
        <EmptyState
          icon={<Puzzle className="size-8" />}
          title={skills.length === 0 ? "No skills installed" : "No installed skills matched"}
          description={
            skills.length === 0
              ? INSTALLED_EMPTY_COPY
              : query || isFilterActive
              ? `No installed skills matched "${query}". Reset the search or filters and try again.`
              : INSTALLED_EMPTY_COPY
          }
          action={
            (query || isFilterActive) && (
              <Button
                variant="link"
                onClick={onResetFilters}
                className="mt-4"
              >
                Reset installed filters
              </Button>
            )
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
