import { setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { routing } from "@atmos/i18n/routing";

type Props = {
  params: Promise<{ locale: string; scope: string; skillId: string }>;
};

export const metadata: Metadata = {
  title: "Skill – ATMOS",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({
    locale,
    scope: "__desktop__",
    skillId: "__desktop__",
  }));
}

export default async function SkillDetailPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return null;
}
