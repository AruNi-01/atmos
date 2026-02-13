import { setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

type Props = {
  params: Promise<{ locale: string }>;
};

export const metadata: Metadata = {
  title: "Skills – ATMOS",
};

export default async function SkillsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return null;
}
