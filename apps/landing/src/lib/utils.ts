import { cn } from "@workspace/ui/lib/utils";

export const formatDate = (date: Date, language: "zh" | "en" = "en"): string => {
  if (language === "zh") {
    return date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

export { cn };
