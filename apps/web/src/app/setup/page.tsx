import type { Metadata } from "next";
import { HostedConnectionSetupPage } from "@/features/welcome/components/HostedWelcomeGate";

export const metadata: Metadata = {
  title: "Setup - ATMOS",
};

export default function SetupPage() {
  return <HostedConnectionSetupPage />;
}
