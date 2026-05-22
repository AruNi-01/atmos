"use client";

import * as React from "react";
import { Button, cn } from "@workspace/ui";
import { RefreshCw, SkipForward, Sparkles } from "lucide-react";

import { useCanvasAgentCrashRecovery } from "../lib/canvas-agent-crash-context";

const AUTO_SKIP_SECONDS = 10;

type BoundaryProps = {
  children: React.ReactNode;
  className?: string;
};

type BoundaryState = {
  hasError: boolean;
  error: Error | null;
};

/**
 * Isolates tldraw crashes (often from invalid agent mutations) from the whole app.
 */
export class CanvasAgentCrashBoundary extends React.Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[canvas-agent] tldraw subtree crashed", error, info.componentStack);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <CanvasAgentCrashFallback
          error={this.state.error}
          onDismiss={this.reset}
          className={this.props.className}
        />
      );
    }
    return this.props.children;
  }
}

function CanvasAgentCrashFallback({
  error,
  onDismiss,
  className,
}: {
  error: Error | null;
  onDismiss: () => void;
  className?: string;
}) {
  const recovery = useCanvasAgentCrashRecovery();
  const [secondsLeft, setSecondsLeft] = React.useState(AUTO_SKIP_SECONDS);
  const [busy, setBusy] = React.useState<"skip" | "refresh" | null>(null);
  const handledRef = React.useRef(false);

  const runSkip = React.useCallback(async () => {
    if (handledRef.current) return;
    handledRef.current = true;
    setBusy("skip");
    try {
      await recovery?.failInflight(
        "Canvas skipped this agent command after an internal tldraw error.",
      );
      recovery?.bumpRemount();
      onDismiss();
    } finally {
      setBusy(null);
    }
  }, [onDismiss, recovery]);

  const runRefresh = React.useCallback(async () => {
    if (handledRef.current) return;
    handledRef.current = true;
    setBusy("refresh");
    try {
      await recovery?.failInflight(
        "Canvas reloaded after an internal tldraw error.",
      );
      await recovery?.reloadBoard();
      recovery?.bumpRemount();
      onDismiss();
    } finally {
      setBusy(null);
    }
  }, [onDismiss, recovery]);

  React.useEffect(() => {
    if (handledRef.current) return;
    const timer = window.setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          window.clearInterval(timer);
          void runSkip();
          return 0;
        }
        return s - 1;
      });
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [runSkip]);

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-6 bg-background px-6 text-center",
        className,
      )}
    >
      <div className="flex size-14 items-center justify-center rounded-2xl border border-border/60 bg-muted/40">
        <Sparkles className="size-7 text-amber-400" aria-hidden />
      </div>
      <div className="max-w-md space-y-2">
        <h2 className="text-lg font-semibold tracking-tight">
          画布被 agent 折腾了一下，暂时罢工了
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          多半是某条 <code className="rounded bg-muted px-1 py-0.5 text-xs">atmos canvas</code>{" "}
          命令和 tldraw 的 schema 合不来。你的画板数据还在，我们可以跳过这次操作，或者从服务器重新加载本 board。
        </p>
        {error?.message ? (
          <p className="mt-3 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-left font-mono text-[11px] text-muted-foreground break-all">
            {error.message}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="default"
          disabled={busy !== null}
          onClick={() => void runSkip()}
          className="gap-2"
        >
          <SkipForward className="size-4" />
          跳过此次操作
          {secondsLeft > 0 ? `（${secondsLeft}s）` : null}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy !== null}
          onClick={() => void runRefresh()}
          className="gap-2"
        >
          <RefreshCw className={cn("size-4", busy === "refresh" && "animate-spin")} />
          刷新恢复
        </Button>
      </div>
    </div>
  );
}