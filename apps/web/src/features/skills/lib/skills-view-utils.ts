import type { ScopeFilter, SkillsTab } from "@/shared/lib/nuqs/searchParams";
import type { SkillMarketCategory, SkillResourceCategory } from "./market-data";

export function buildSkillListUrl({
  activeTab,
  filter,
  projects,
  query,
}: {
  activeTab: SkillsTab;
  filter: ScopeFilter;
  projects: string;
  query: string;
}) {
  const searchParams = new URLSearchParams();

  if (activeTab !== "installed") {
    searchParams.set("skillsTab", activeTab);
  }
  if (filter !== "all") {
    searchParams.set("filter", filter);
  }
  if (projects) {
    searchParams.set("projects", projects);
  }
  if (query.trim()) {
    searchParams.set("q", query.trim());
  }

  const search = searchParams.toString();
  return search ? `/skills?${search}` : "/skills";
}

/** List filters + installed skill identity for push-detail deep links. */
export function buildSkillDetailUrl({
  activeTab,
  filter,
  projects,
  query,
  skillScope,
  skillId,
}: {
  activeTab: SkillsTab;
  filter: ScopeFilter;
  projects: string;
  query: string;
  skillScope: string;
  skillId: string;
}) {
  const listUrl = buildSkillListUrl({ activeTab, filter, projects, query });
  const searchParams = new URLSearchParams(
    listUrl.includes("?") ? listUrl.split("?", 1)[1] : "",
  );
  searchParams.set("scope", skillScope);
  searchParams.set("skillId", skillId);
  return `/skills?${searchParams.toString()}`;
}

export function filterMarketCategories(categories: SkillMarketCategory[], query: string) {
  if (!query) {
    return categories;
  }

  return categories
    .map((category) => ({
      ...category,
      items: category.items.filter((item) => {
        const haystack = [
          category.title,
          item.title,
          item.description,
          item.author?.handle,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      }),
    }))
    .filter((category) => category.items.length > 0);
}

export function filterResourceCategories(categories: SkillResourceCategory[], query: string) {
  if (!query) {
    return categories;
  }

  return categories
    .map((category) => ({
      ...category,
      items: category.items.filter((item) => {
        const haystack = [category.title, item.title, item.description].join(" ").toLowerCase();
        return haystack.includes(query);
      }),
    }))
    .filter((category) => category.items.length > 0);
}

export function countCategoryItems(categories: Array<{ items: readonly unknown[] }>) {
  return categories.reduce((total, category) => total + category.items.length, 0);
}
