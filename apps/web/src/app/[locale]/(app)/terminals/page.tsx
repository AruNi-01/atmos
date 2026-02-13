import { setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

type Props = {
  params: Promise<{ locale: string }>;
};

export const metadata: Metadata = {
  title: "Terminals – ATMOS",
};

export default async function TerminalsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return null;
}
