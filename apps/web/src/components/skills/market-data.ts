import marketDataJson from "../../../../../skills/market/skills_market_en.json";

export interface SkillMarketAuthor {
  handle: string;
  url: string;
}

export interface SkillMarketItem {
  id: string;
  title: string;
  description: string;
  sourceUrl: string;
  downloadUrl: string;
  author: SkillMarketAuthor | null;
}

export interface SkillMarketCategory {
  id: string;
  title: string;
  items: SkillMarketItem[];
}

export interface SkillResourceItem {
  id: string;
  title: string;
  description: string;
  url: string;
}

export interface SkillResourceCategory {
  id: string;
  title: string;
  items: SkillResourceItem[];
}

export interface SkillsMarketData {
  locale: string;
  source: string;
  generatedAt: string;
  market: {
    totalSkills: number;
    categories: SkillMarketCategory[];
  };
  resources: {
    totalResources: number;
    categories: SkillResourceCategory[];
  };
}

export const skillsMarketData = marketDataJson as SkillsMarketData;
export const marketCategories = skillsMarketData.market.categories;
export const resourceCategories = skillsMarketData.resources.categories;

export function normalizeSkillInstallUrl(url: string) {
  return url.replace("/blob/", "/tree/");
}

export function buildSkillInstallCommand(url: string) {
  return `npx skills add ${normalizeSkillInstallUrl(url)}`;
}

export function resolveSkillSourceUrl(item: SkillMarketItem) {
  return item.sourceUrl.startsWith("http") ? item.sourceUrl : item.downloadUrl;
}

export function hasInferredDownloadUrl(item: SkillMarketItem) {
  return item.sourceUrl !== item.downloadUrl;
}
