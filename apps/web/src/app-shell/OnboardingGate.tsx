'use client';

import React, { useState, useEffect, lazy, Suspense } from 'react';
import { isHostedAtmosOrigin } from '@/shared/lib/desktop-runtime';

const OnboardingPage = lazy(
  () => import('@/features/welcome/components/OnboardingPage'),
);

interface OnboardingGateProps {
  children: React.ReactNode;
}

function readOnboardingDone(): boolean {
  try {
    return localStorage.getItem('atmos_onboarding_done') === 'true';
  } catch {
    return false;
  }
}

function writeOnboardingDone(): void {
  try {
    localStorage.setItem('atmos_onboarding_done', 'true');
  } catch {
    /* private browsing / storage disabled */
  }
}

export function OnboardingGate({ children }: OnboardingGateProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [isOnboardingDone, setIsOnboardingDone] = useState(false);
  const [skipOnboarding, setSkipOnboarding] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    // Hosted Atmos is a remote Computer client — local dependency onboarding
    // (tmux/git/gh) does not apply after HostedWelcomeGate connection setup.
    if (isHostedAtmosOrigin()) {
      setSkipOnboarding(true);
      return;
    }
    setIsOnboardingDone(readOnboardingDone());
  }, []);

  if (!isMounted) {
    // Prevent SSR hydration mismatch
    return <div className="min-h-screen w-full bg-background" />;
  }

  if (skipOnboarding || isOnboardingDone) {
    return <>{children}</>;
  }

  return (
    <Suspense fallback={<div className="min-h-screen w-full bg-background" />}>
      <OnboardingPage
        onComplete={() => {
          writeOnboardingDone();
          setIsOnboardingDone(true);
        }}
      />
    </Suspense>
  );
}
