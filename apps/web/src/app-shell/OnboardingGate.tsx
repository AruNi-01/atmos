'use client';

import React, { lazy, Suspense, useState, useSyncExternalStore } from 'react';
import { isHostedAtmosOrigin } from '@/shared/lib/desktop-runtime';

const OnboardingPage = lazy(
  () => import('@/features/welcome/components/OnboardingPage'),
);

interface OnboardingGateProps {
  children: React.ReactNode;
}

const ONBOARDING_DONE_KEY = 'atmos_onboarding_done';

const subscribeMounted = () => () => {};
const getClientMountedSnapshot = () => true;
const getServerMountedSnapshot = () => false;

function readOnboardingDone(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_DONE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeOnboardingDone(): void {
  try {
    localStorage.setItem(ONBOARDING_DONE_KEY, 'true');
  } catch {
    /* private browsing / storage disabled */
  }
}

export function OnboardingGate({ children }: OnboardingGateProps) {
  const mounted = useSyncExternalStore(
    subscribeMounted,
    getClientMountedSnapshot,
    getServerMountedSnapshot,
  );
  // Forces the gate closed for this session after onComplete (also covers
  // private-mode cases where localStorage.setItem throws).
  const [sessionCompleted, setSessionCompleted] = useState(false);

  if (!mounted) {
    // Prevent SSR hydration mismatch
    return <div className="min-h-screen w-full bg-background" />;
  }

  // Hosted Atmos is a remote Computer client — local dependency onboarding
  // (tmux/git/gh) does not apply after HostedWelcomeGate connection setup.
  const skipOnboarding = isHostedAtmosOrigin();
  const isOnboardingDone = sessionCompleted || readOnboardingDone();

  if (skipOnboarding || isOnboardingDone) {
    return <>{children}</>;
  }

  return (
    <Suspense fallback={<div className="min-h-screen w-full bg-background" />}>
      <OnboardingPage
        onComplete={() => {
          writeOnboardingDone();
          setSessionCompleted(true);
        }}
      />
    </Suspense>
  );
}
