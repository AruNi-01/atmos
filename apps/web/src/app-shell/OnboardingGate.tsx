'use client';

import React, { useState, useEffect } from 'react';
import OnboardingPage from '@/features/welcome/components/OnboardingPage';

interface OnboardingGateProps {
  children: React.ReactNode;
}

export function OnboardingGate({ children }: OnboardingGateProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [isOnboardingDone, setIsOnboardingDone] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const done = localStorage.getItem('atmos_onboarding_done') === 'true';
    setIsOnboardingDone(done);
  }, []);

  if (!isMounted) {
    // Prevent SSR hydration mismatch
    return <div className="min-h-screen w-full bg-background" />;
  }

  if (!isOnboardingDone) {
    return (
      <OnboardingPage
        onComplete={() => {
          localStorage.setItem('atmos_onboarding_done', 'true');
          setIsOnboardingDone(true);
        }}
      />
    );
  }

  return <>{children}</>;
}
