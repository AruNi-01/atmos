"use client";

import React from "react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui";
import { Check, Tag, User } from "lucide-react";
import {
  useGithubRepoAssigneesQuery,
  useGithubRepoLabelsQuery,
} from "@/features/github/hooks/use-github-pr-query";
import { cn } from "@/shared/lib/utils";

type GithubMetadataFilterProps = {
  owner: string;
  repo: string;
  selected: string[];
  onSelectedChange: React.Dispatch<React.SetStateAction<string[]>>;
  labels: {
    trigger: string;
    search: string;
    empty: string;
    clear: string;
  };
};

function toggle(
  value: string,
  setSelected: React.Dispatch<React.SetStateAction<string[]>>,
) {
  setSelected((current) =>
    current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value],
  );
}

/** Compact icon-only filter trigger; selected count sits inside the button. */
const FilterIconTrigger = React.forwardRef<
  HTMLButtonElement,
  {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    count: number;
    active: boolean;
  } & React.ComponentPropsWithoutRef<"button">
>(function FilterIconTrigger(
  { icon: Icon, label, count, active, className, type: _type, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      title={label}
      aria-label={count > 0 ? `${label} (${count})` : label}
      className={cn(
        "inline-flex h-6 shrink-0 items-center justify-center gap-0.5 rounded-md text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        count > 0 ? "min-w-6 px-1.5" : "w-6 px-0",
        active && "bg-muted text-foreground",
        className,
      )}
      {...props}
    >
      <Icon className="size-3.5 shrink-0" />
      {count > 0 ? (
        <span className="min-w-3 tabular-nums leading-none text-foreground">
          {count}
        </span>
      ) : null}
    </button>
  );
});

export function GithubLabelsFilter({
  owner,
  repo,
  selected,
  onSelectedChange,
  labels,
}: GithubMetadataFilterProps) {
  const [open, setOpen] = React.useState(false);
  const { data: repoLabels = [] } = useGithubRepoLabelsQuery({
    owner,
    repo,
    enabled: open,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <FilterIconTrigger
          icon={Tag}
          label={labels.trigger}
          count={selected.length}
          active={open || selected.length > 0}
        />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder={labels.search} />
          <CommandEmpty>{labels.empty}</CommandEmpty>
          <CommandGroup>
            {repoLabels.map((label) => {
              const isSelected = selected.includes(label.name);
              return (
                <CommandItem
                  key={label.name}
                  value={`${label.name} ${label.description ?? ""}`}
                  onSelect={() => toggle(label.name, onSelectedChange)}
                >
                  <span
                    className="size-2.5 rounded-full"
                    style={{
                      backgroundColor: label.color
                        ? `#${label.color.replace(/^#/, "")}`
                        : "var(--muted-foreground)",
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate">{label.name}</span>
                  {isSelected ? <Check className="size-3.5" /> : null}
                </CommandItem>
              );
            })}
          </CommandGroup>
        </Command>
        {selected.length > 0 ? (
          <div className="border-t border-border/50 p-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-full text-[11px] text-muted-foreground"
              onClick={() => onSelectedChange([])}
            >
              {labels.clear}
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

export function GithubAssigneesFilter({
  owner,
  repo,
  selected,
  onSelectedChange,
  labels,
}: GithubMetadataFilterProps) {
  const [open, setOpen] = React.useState(false);
  const { data: repoAssignees = [] } = useGithubRepoAssigneesQuery({
    owner,
    repo,
    enabled: open,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <FilterIconTrigger
          icon={User}
          label={labels.trigger}
          count={selected.length}
          active={open || selected.length > 0}
        />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder={labels.search} />
          <CommandEmpty>{labels.empty}</CommandEmpty>
          <CommandGroup>
            {repoAssignees.map((assignee) => {
              const isSelected = selected.includes(assignee.login);
              return (
                <CommandItem
                  key={assignee.login}
                  value={assignee.login}
                  onSelect={() => toggle(assignee.login, onSelectedChange)}
                >
                  <Avatar className="size-4">
                    <AvatarImage src={assignee.avatar_url ?? undefined} />
                    <AvatarFallback className="text-[6px]">
                      {assignee.login.slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate">
                    {assignee.login}
                  </span>
                  {isSelected ? <Check className="size-3.5" /> : null}
                </CommandItem>
              );
            })}
          </CommandGroup>
        </Command>
        {selected.length > 0 ? (
          <div className="border-t border-border/50 p-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-full text-[11px] text-muted-foreground"
              onClick={() => onSelectedChange([])}
            >
              {labels.clear}
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
