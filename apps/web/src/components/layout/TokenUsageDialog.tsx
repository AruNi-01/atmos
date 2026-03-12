"use client";

import * as React from "react";
import {
  Activity,
  CalendarRange,
  ChartColumnBig,
  Flame,
  Sparkles,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  ScrollArea,
} from "@workspace/ui";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  agentUsage,
  heatmapWeeks,
  monthlyTrend,
  tokenMix,
  tokenUsageStats,
} from "./token-usage-mock";

const monthlyChartConfig = {
  tokens: {
    label: "Tokens",
    color: "var(--color-chart-1)",
  },
  sessions: {
    label: "Sessions",
    color: "var(--color-chart-3)",
  },
} satisfies ChartConfig;

const agentChartConfig = {
  tokens: {
    label: "Tokens",
    color: "var(--color-chart-2)",
  },
} satisfies ChartConfig;

const tokenMixChartConfig = {
  input: {
    label: "Input",
    color: "var(--color-chart-1)",
  },
  output: {
    label: "Output",
    color: "var(--color-chart-2)",
  },
  cache: {
    label: "Cache read",
    color: "var(--color-chart-3)",
  },
  reasoning: {
    label: "Reasoning",
    color: "var(--color-chart-4)",
  },
} satisfies ChartConfig;

const dayLabels = ["S", "M", "T", "W", "T", "F", "S"];

export function TokenUsageDialog() {
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          aria-label="Token usage"
          className="size-8 flex items-center justify-center rounded-md text-muted-foreground transition-colors duration-200 ease-out hover:bg-accent hover:text-accent-foreground"
          title="Token usage"
        >
          <ChartColumnBig className="size-4" />
        </button>
      </DialogTrigger>

      <DialogContent
        showCloseButton={false}
        className="top-1/2 left-1/2 h-[100dvh] w-[100vw] max-w-[100vw] translate-x-[-50%] translate-y-[-50%] gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-2rem)] sm:rounded-[28px] sm:border sm:border-border/70"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Token usage</DialogTitle>
          <DialogDescription>
            Full-screen token usage dashboard preview with mock data.
          </DialogDescription>
        </DialogHeader>

        <div
          className="relative flex h-full flex-col bg-background"
          style={{
            backgroundImage: [
              "radial-gradient(circle at top left, color-mix(in oklch, var(--color-chart-1) 24%, transparent), transparent 28%)",
              "radial-gradient(circle at top right, color-mix(in oklch, var(--color-chart-2) 18%, transparent), transparent 26%)",
              "linear-gradient(180deg, color-mix(in oklch, var(--muted) 65%, transparent), transparent 24%)",
            ].join(", "),
          }}
        >
          <div className="border-b border-border/60 px-4 py-4 sm:px-6 sm:py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="rounded-full border-border/70 bg-background/70 px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                    Mock Data
                  </Badge>
                  <Badge variant="outline" className="rounded-full border-border/70 bg-background/70 px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                    26-week sample
                  </Badge>
                </div>
                <div className="space-y-2">
                  <h1 className="text-left text-2xl font-semibold tracking-tight sm:text-4xl">
                    Token usage cockpit
                  </h1>
                  <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                    A full-screen preview of the local token history surface. The heatmap keeps the
                    GitHub cadence, while the rest of the panel leans on shadcn-style charts for
                    trend, source, and token-shape breakdowns.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start">
                <div className="hidden rounded-2xl border border-border/70 bg-background/80 px-3 py-2 text-right backdrop-blur sm:block">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    Status
                  </div>
                  <div className="mt-1 flex items-center justify-end gap-2 text-sm font-medium">
                    <span className="size-2 rounded-full bg-[var(--color-chart-2)]" />
                    Demo dashboard ready
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-10 rounded-2xl border-border/70 bg-background/80 backdrop-blur"
                  onClick={() => setOpen(false)}
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-6 px-4 py-5 sm:px-6 sm:py-6">
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {tokenUsageStats.map((stat, index) => (
                  <Card
                    key={stat.label}
                    className="overflow-hidden border-border/70 bg-card/85 shadow-none backdrop-blur"
                  >
                    <CardHeader className="space-y-3 pb-3">
                      <div className="flex items-center justify-between">
                        <CardDescription className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                          {stat.label}
                        </CardDescription>
                        <div
                          className="rounded-full border border-border/70 p-2"
                          style={{ backgroundColor: statAccent(index, 0.14) }}
                        >
                          {index === 0 ? (
                            <Sparkles className="size-4 text-[var(--color-chart-1)]" />
                          ) : index === 1 ? (
                            <CalendarRange className="size-4 text-[var(--color-chart-2)]" />
                          ) : index === 2 ? (
                            <Activity className="size-4 text-[var(--color-chart-3)]" />
                          ) : (
                            <Flame className="size-4 text-[var(--color-chart-4)]" />
                          )}
                        </div>
                      </div>
                      <CardTitle className="text-3xl font-semibold tracking-tight">
                        {stat.value}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex items-center justify-between gap-3">
                      <span className="rounded-full border border-border/70 px-2.5 py-1 text-xs font-medium text-foreground">
                        {stat.change}
                      </span>
                      <span className="text-right text-xs text-muted-foreground">{stat.note}</span>
                    </CardContent>
                  </Card>
                ))}
              </section>

              <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                <Card className="border-border/70 bg-card/88 shadow-none backdrop-blur">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      Trend
                    </CardDescription>
                    <CardTitle className="text-xl">Monthly token curve</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <ChartContainer config={monthlyChartConfig} className="h-[280px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={monthlyTrend} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                          <defs>
                            <linearGradient id="tokens-fill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="var(--color-chart-1)" stopOpacity={0.42} />
                              <stop offset="95%" stopColor="var(--color-chart-1)" stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid vertical={false} />
                          <XAxis
                            dataKey="month"
                            axisLine={false}
                            tickLine={false}
                            tickMargin={10}
                          />
                          <YAxis
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(value) => `${Math.round(value / 1_000_000)}M`}
                            width={42}
                          />
                          <ChartTooltip
                            cursor={false}
                            content={
                              <ChartTooltipContent
                                formatter={(value, name) =>
                                  name === "Sessions"
                                    ? `${value} sessions`
                                    : `${(Number(value) / 1_000_000).toFixed(1)}M`
                                }
                              />
                            }
                          />
                          <Area
                            type="monotone"
                            dataKey="tokens"
                            stroke="var(--color-chart-1)"
                            strokeWidth={2.5}
                            fill="url(#tokens-fill)"
                          />
                          <Area
                            type="monotone"
                            dataKey="sessions"
                            stroke="var(--color-chart-3)"
                            strokeDasharray="4 4"
                            strokeWidth={2}
                            fillOpacity={0}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </CardContent>
                </Card>

                <div className="grid gap-4">
                  <Card className="border-border/70 bg-card/88 shadow-none backdrop-blur">
                    <CardHeader className="pb-2">
                      <CardDescription className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                        Sources
                      </CardDescription>
                      <CardTitle className="text-xl">Agent distribution</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-2">
                      <ChartContainer config={agentChartConfig} className="h-[220px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={agentUsage} layout="vertical" margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
                            <CartesianGrid horizontal={false} />
                            <XAxis
                              type="number"
                              axisLine={false}
                              tickLine={false}
                              tickFormatter={(value) => `${Math.round(value / 1_000_000)}M`}
                            />
                            <YAxis
                              type="category"
                              dataKey="agent"
                              axisLine={false}
                              tickLine={false}
                              width={58}
                            />
                            <ChartTooltip
                              cursor={false}
                              content={
                                <ChartTooltipContent
                                  labelFormatter={(label) => `${label}`}
                                  formatter={(value) => `${(Number(value) / 1_000_000).toFixed(1)}M`}
                                />
                              }
                            />
                            <Bar
                              dataKey="tokens"
                              radius={[8, 8, 8, 8]}
                              fill="var(--color-chart-2)"
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </ChartContainer>
                    </CardContent>
                  </Card>

                  <Card className="border-border/70 bg-card/88 shadow-none backdrop-blur">
                    <CardHeader className="pb-2">
                      <CardDescription className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                        Shape
                      </CardDescription>
                      <CardTitle className="text-xl">Token mix</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-2">
                      <ChartContainer config={tokenMixChartConfig} className="h-[250px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <ChartTooltip
                              cursor={false}
                              content={
                                <ChartTooltipContent
                                  hideLabel
                                  formatter={(value) => `${(Number(value) / 1_000_000).toFixed(1)}M`}
                                />
                              }
                            />
                            <Pie
                              data={tokenMix}
                              dataKey="value"
                              nameKey="key"
                              innerRadius={62}
                              outerRadius={86}
                              paddingAngle={3}
                              strokeWidth={0}
                            >
                              {tokenMix.map((entry) => (
                                <Cell key={entry.key} fill={entry.fill} />
                              ))}
                            </Pie>
                            <ChartLegend content={<ChartLegendContent />} />
                          </PieChart>
                        </ResponsiveContainer>
                      </ChartContainer>
                    </CardContent>
                  </Card>
                </div>
              </section>

              <section>
                <Card className="border-border/70 bg-card/88 shadow-none backdrop-blur">
                  <CardHeader className="gap-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <CardDescription className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                          Daily activity
                        </CardDescription>
                        <CardTitle className="text-xl">GitHub-style token heatmap</CardTitle>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Less</span>
                        {([0, 1, 2, 3, 4] as const).map((level) => (
                          <span
                            key={level}
                            className="size-3 rounded-[4px] border border-border/60"
                            style={{ backgroundColor: heatmapColor(level) }}
                          />
                        ))}
                        <span>More</span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <div className="overflow-x-auto">
                      <div className="min-w-[860px]">
                        <div className="grid grid-cols-[auto_1fr] gap-3">
                          <div />
                          <div
                            className="grid gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
                            style={{ gridTemplateColumns: `repeat(${heatmapWeeks.length}, minmax(0, 1fr))` }}
                          >
                            {heatmapWeeks.map((week, index) => (
                              <div key={`${week.label}-${index}`} className="min-h-4">
                                {week.label}
                              </div>
                            ))}
                          </div>

                          <div className="grid gap-2 pt-[2px] text-[11px] text-muted-foreground">
                            {dayLabels.map((label, index) => (
                              <div key={`${label}-${index}`} className="flex h-3 items-center">
                                {index % 2 === 1 ? label : ""}
                              </div>
                            ))}
                          </div>

                          <div
                            className="grid gap-2"
                            style={{ gridTemplateColumns: `repeat(${heatmapWeeks.length}, minmax(0, 1fr))` }}
                          >
                            {heatmapWeeks.map((week, weekIndex) => (
                              <div key={`week-${weekIndex}`} className="grid gap-2">
                                {week.cells.map((cell) => (
                                  <div
                                    key={cell.date}
                                    className="size-3 rounded-[4px] border border-border/60 transition-transform duration-150 hover:scale-125"
                                    style={{ backgroundColor: heatmapColor(cell.level) }}
                                    title={
                                      cell.count === null
                                        ? cell.date
                                        : `${cell.date}: ${cell.count.toLocaleString()} tokens`
                                    }
                                  />
                                ))}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </section>
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function heatmapColor(level: 0 | 1 | 2 | 3 | 4) {
  if (level === 0) {
    return "color-mix(in oklch, var(--muted) 92%, var(--background))";
  }

  if (level === 1) {
    return "color-mix(in oklch, var(--color-chart-2) 28%, var(--background))";
  }

  if (level === 2) {
    return "color-mix(in oklch, var(--color-chart-2) 48%, var(--background))";
  }

  if (level === 3) {
    return "color-mix(in oklch, var(--color-chart-2) 66%, var(--background))";
  }

  return "color-mix(in oklch, var(--color-chart-2) 84%, var(--background))";
}

function statAccent(index: number, amount: number) {
  const color = `var(--color-chart-${Math.min(index + 1, 4)})`;
  return `color-mix(in oklch, ${color} ${Math.round(amount * 100)}%, transparent)`;
}
