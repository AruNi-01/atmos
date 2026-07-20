import type { ReactNode, RefObject } from "react";
import { createContext, useContext, useRef } from "react";
import { ParticleField } from "./particle-field";
import { AuthSplitLayout } from "./auth-split-layout";
import welcomeSrc from "../assets/figures/welcome.png";
import teamSrc from "../assets/figures/team.png";
import clustersSrc from "../assets/figures/clusters.png";

type ImpulseRef = RefObject<number>;
const TypingImpulseContext = createContext<ImpulseRef | null>(null);

export function useAuthTypingImpulse(): ImpulseRef {
  const ctx = useContext(TypingImpulseContext);
  if (!ctx) throw new Error("useAuthTypingImpulse outside <AuthShell>");
  return ctx;
}

type Variant = "welcome" | "request-access" | "onboarding";

const FIGURES: Record<Variant, any> = {
  welcome: welcomeSrc,
  "request-access": teamSrc,
  onboarding: clustersSrc,
};

export function AuthShell({
  children,
  variant = "welcome",
}: {
  children: ReactNode;
  variant?: Variant;
}) {
  const typingImpulseRef = useRef(0);
  const rawSrc = FIGURES[variant];
  const src = typeof rawSrc === "string" ? rawSrc : rawSrc?.src || "";
  return (
    <TypingImpulseContext.Provider value={typingImpulseRef}>
      <AuthSplitLayout
        rightClassName="lg:w-[620px]"
        left={
          <>
            <ParticleField
              src={src}
              sampleStep={3}
              threshold={34}
              dotSize={1}
              renderScale={1}
              align="center"
              typingImpulseRef={typingImpulseRef}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(900px 600px at 50% 50%, transparent 45%, color-mix(in srgb, var(--background) 88%, transparent) 92%)",
              }}
            />
            <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-12">
              <div className="pointer-events-auto flex items-center gap-2 font-mono text-sm">
                <span className="inline-block h-2 w-2 rounded-full bg-foreground" />
                <span className="tracking-[0.2em] uppercase">Atmos</span>
              </div>
              {variant === "request-access" ? (
                <div className="max-w-md">
                  <div className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.3em]">
                    Quiet onboarding
                  </div>
                  <p className="mt-3 font-heading text-xl leading-snug md:text-2xl">
                    A waitlist screen with a particle figure and a single soft
                    CTA — for invite-only entry points.
                  </p>
                </div>
              ) : variant === "onboarding" ? (
                <div className="max-w-md">
                  <div className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.3em]">
                    First steps
                  </div>
                  <p className="mt-3 font-heading text-xl leading-snug md:text-2xl">
                    A guided multi-step setup, paced so each screen carries one
                    decision at a time.
                  </p>
                </div>
              ) : (
                <div className="max-w-md">
                  <div className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.3em]">
                    Sign-in design
                  </div>
                  <p className="mt-3 font-heading text-xl leading-snug md:text-2xl">
                    Split layout with a particle field on the left and a single
                    centered form on the right.
                  </p>
                </div>
              )}
            </div>
          </>
        }
        right={children}
      />
    </TypingImpulseContext.Provider>
  );
}
