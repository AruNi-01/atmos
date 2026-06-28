import type { ScopeFilter, SkillsTab } from "@/shared/lib/nuqs/searchParams";
import { createTranslator } from "next-intl";
import type { SkillMarketCategory, SkillResourceCategory } from "./market-data";
import enMessages from "../../../../messages/en.json";
import zhMessages from "../../../../messages/zh.json";
import { currentAppLocale } from "@/shared/lib/current-app-locale";

let cachedSkillsViewLocale: "en" | "zh" | null = null;
let cachedSkillsViewTranslator: any = null;

function skillsViewUtilsT(
  key: "installedEmptyCopy" | "marketEmptyCopy" | "resourcesEmptyCopy",
) {
  const locale = currentAppLocale("en") === "zh" ? "zh" : "en";
  if (!cachedSkillsViewTranslator || cachedSkillsViewLocale !== locale) {
    cachedSkillsViewLocale = locale;
    cachedSkillsViewTranslator = createTranslator({
      locale,
      messages: locale === "zh" ? zhMessages : enMessages,
      namespace: "skills.viewUtils",
    });
  }
  return cachedSkillsViewTranslator(key as never);
}

export const INSTALLED_EMPTY_COPY = skillsViewUtilsT("installedEmptyCopy");
export const MARKET_EMPTY_COPY = skillsViewUtilsT("marketEmptyCopy");
export const RESOURCES_EMPTY_COPY = skillsViewUtilsT("resourcesEmptyCopy");

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
    searchParams.set("tab", activeTab);
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
