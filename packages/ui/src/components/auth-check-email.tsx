import { useEffect, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  MailIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthShell } from "./auth-shell";

const RESEND_SECONDS = 30;

export function AuthCheckEmailShowcasePage() {
  const email = "you@example.com";
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [resendCount, setResendCount] = useState(0);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = window.setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearInterval(t);
  }, [secondsLeft]);

  const onResend = () => {
    setResending(true);
    window.setTimeout(() => {
      setResending(false);
      setResendCount((c) => c + 1);
      setSecondsLeft(RESEND_SECONDS);
    }, 600);
  };

  return (
    <AuthShell variant="welcome">
      <div className="w-full max-w-lg">
        <div className="inline-flex size-11 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2Icon className="size-5" />
        </div>

        <div className="mt-5 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.3em]">
          Magic link sent
        </div>
        <h1 className="mt-2 font-heading text-3xl leading-tight">
          Check your inbox.
        </h1>
        <p className="mt-2 max-w-md text-muted-foreground text-sm leading-relaxed">
          We sent a sign-in link to{" "}
          <span className="font-medium text-foreground">{email}</span>. Click it
          to continue — the link expires in{" "}
          <span className="text-foreground">10 minutes</span>.
        </p>

        <div className="mt-7 flex flex-col gap-2">
          <Button size="lg" type="button">
            <MailIcon />
            Open mail app
          </Button>
          <Button
            size="lg"
            variant="ghost"
            type="button"
            disabled={secondsLeft > 0 || resending}
            loading={resending}
            onClick={onResend}
          >
            {secondsLeft > 0
              ? `Resend in ${String(secondsLeft).padStart(2, "0")}s`
              : "Resend link"}
          </Button>
        </div>

        {resendCount > 0 ? (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-1 font-mono text-[10px] text-emerald-700 uppercase tracking-[0.25em] dark:text-emerald-400">
            <CheckCircle2Icon className="size-3" />
            Sent again · {resendCount}
          </div>
        ) : null}

        <div className="mt-8 border-border/60 border-t pt-5">
          <a
            href="#"
            className="inline-flex items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
          >
            <ArrowLeftIcon className="size-3.5" />
            Use a different email
          </a>
          <p className="mt-3 text-muted-foreground text-xs leading-relaxed">
            Didn't get the email? Check spam, then{" "}
            <a
              href="#"
              className="inline-flex items-center gap-1 text-foreground underline-offset-4 hover:underline"
            >
              contact support
              <ArrowRightIcon className="size-3" />
            </a>
            .
          </p>
        </div>
      </div>
    </AuthShell>
  );
}
