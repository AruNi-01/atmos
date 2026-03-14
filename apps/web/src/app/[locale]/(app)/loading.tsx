export default function AppLoading() {
  return (
    <div className="flex flex-1 flex-col bg-background">
      {/* Header skeleton */}
      <div className="flex h-12 items-center gap-3 border-b border-border px-4">
        <div className="h-5 w-24 animate-pulse rounded bg-muted" />
        <div className="h-5 w-32 animate-pulse rounded bg-muted" />
        <div className="ml-auto h-5 w-8 animate-pulse rounded bg-muted" />
      </div>

      {/* Content skeleton */}
      <div className="flex flex-1 gap-4 p-4">
        {/* Sidebar placeholder */}
        <div className="hidden w-56 flex-col gap-3 md:flex">
          <div className="h-8 w-full animate-pulse rounded bg-muted" />
          <div className="h-8 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-8 w-5/6 animate-pulse rounded bg-muted" />
          <div className="h-8 w-2/3 animate-pulse rounded bg-muted" />
        </div>

        {/* Main content placeholder */}
        <div className="flex flex-1 flex-col gap-4">
          <div className="h-10 w-2/5 animate-pulse rounded bg-muted" />
          <div className="h-32 w-full animate-pulse rounded bg-muted" />
          <div className="h-24 w-full animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}
