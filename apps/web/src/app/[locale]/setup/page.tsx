import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { HostedConnectionSetupPage } from "@/features/welcome/components/HostedWelcomeGate";

type Props = {
  params: Promise<{ locale: string }>;
};

export const metadata: Metadata = {
  title: "Setup - ATMOS",
};

export default async function SetupPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <HostedConnectionSetupPage />;
}
