import { Suspense } from "react";
import { GithubSetupCompletionPage } from "@/features/automations/components/GithubSetupCompletionPage";

export const metadata = {
  title: "GitHub Setup - ATMOS",
};

export default function GithubSetupCompleteRoute() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-background" />}>
      <GithubSetupCompletionPage />
    </Suspense>
  );
}
