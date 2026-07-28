'use client';

import React, { useSyncExternalStore } from 'react';
import OnboardingPage from '@/features/welcome/components/OnboardingPage';
import { useAppRouter } from '@/shared/hooks/use-app-router';

const subscribeMounted = () => () => {};
const getClientMountedSnapshot = () => true;
const getServerMountedSnapshot = () => false;

export default function OnboardingClientPage() {
  const router = useAppRouter();
  const isMounted = useSyncExternalStore(
    subscribeMounted,
    getClientMountedSnapshot,
    getServerMountedSnapshot,
  );

  const handleComplete = () => {
    try {
      localStorage.setItem('atmos_onboarding_done', 'true');
    } catch {
      /* private browsing / storage disabled — still leave onboarding */
    }
    try {
      window.dispatchEvent(new Event('atmos:onboarding-done'));
    } catch {
      /* ignore */
    }
    router.replace('/');
  };

  if (!isMounted) {
    return <div className="min-h-screen w-full bg-background" />;
  }

  return <OnboardingPage onComplete={handleComplete} />;
}
