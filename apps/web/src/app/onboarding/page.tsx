import type { Metadata } from "next";
import OnboardingClientPage from "./OnboardingClientPage";

export const metadata: Metadata = {
  title: "Onboarding - ATMOS",
};

export default function OnboardingPage() {
  return <OnboardingClientPage />;
}
