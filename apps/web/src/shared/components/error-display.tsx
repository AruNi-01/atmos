import { cn } from "@workspace/ui";
import { useTranslations } from "next-intl";

interface ErrorDisplayProps {
  message?: string;
  fallbackMessage?: string;
  onRetry: () => void;
  className?: string;
}

export function ErrorDisplay({
  message,
  fallbackMessage,
  onRetry,
  className,
}: ErrorDisplayProps) {
  const t = useTranslations("shared.errorDisplay");
  return (
    <div
      className={cn(
        "flex items-center justify-center bg-background px-4",
        className,
      )}
    >
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <div className="rounded-full bg-destructive/10 p-3">
          <svg
            className="h-6 w-6 text-destructive"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-foreground">
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {message || fallbackMessage || t("fallbackMessage")}
        </p>
        <button
          onClick={onRetry}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {t("retry")}
        </button>
      </div>
    </div>
  );
}
