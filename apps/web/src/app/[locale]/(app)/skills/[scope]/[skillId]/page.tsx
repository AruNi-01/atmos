import { setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

type Props = {
  params: Promise<{ locale: string; scope: string; skillId: string }>;
};

export const metadata: Metadata = {
  title: "Skill – ATMOS",
};

export default async function SkillDetailPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return null;
}
