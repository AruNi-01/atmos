"use client";

import React from "react";
import { Check, FolderHeart, Pencil, Search, Trash2, X } from "lucide-react";

import {
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui";
import type { FavoriteSite } from "../lib/preview-utils";

export interface PreviewFavoritesListPopoverProps {
  favoriteSearch: string;
  favorites: FavoriteSite[];
  favoritesListOpen: boolean;
  filteredFavorites: FavoriteSite[];
  renameDraft: string;
  renamingUrl: string | null;
  handleDeleteFavorite: (site: FavoriteSite) => Promise<void>;
  handleRenameFavorite: (site: FavoriteSite) => Promise<void>;
  navigateToUrl: (nextValue: string, pushHistory?: boolean) => void;
  setFavoriteSearch: React.Dispatch<React.SetStateAction<string>>;
  setFavoritesListOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setRenameDraft: React.Dispatch<React.SetStateAction<string>>;
  setRenamingUrl: React.Dispatch<React.SetStateAction<string | null>>;
}

export function PreviewFavoritesListPopover({
  favoriteSearch,
  favorites,
  favoritesListOpen,
  filteredFavorites,
  renameDraft,
  renamingUrl,
  handleDeleteFavorite,
  handleRenameFavorite,
  navigateToUrl,
  setFavoriteSearch,
  setFavoritesListOpen,
  setRenameDraft,
  setRenamingUrl,
}: PreviewFavoritesListPopoverProps) {
  return (
    <Popover open={favoritesListOpen} onOpenChange={setFavoritesListOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
          title="Favorites"
          aria-label="Favorites"
        >
          <FolderHeart className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[340px] p-2"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onPointerDownOutside={() => setFavoritesListOpen(false)}
        onEscapeKeyDown={() => setFavoritesListOpen(false)}
      >
        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={favoriteSearch}
              onChange={(event) => setFavoriteSearch(event.target.value)}
              placeholder="Search favorites"
              className="h-8 pl-8 text-xs"
            />
          </div>

          <div className="max-h-[280px] space-y-1 overflow-y-auto pr-1">
            {filteredFavorites.length === 0 ? (
              <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                {favorites.length === 0 ? "No favorites yet" : "No matching favorites"}
              </div>
            ) : (
              filteredFavorites.map((site) => {
                const isRenaming = renamingUrl === site.url;
                return (
                  <div
                    key={site.url}
                    className="group/item rounded-md border border-transparent px-2 py-2 hover:border-border hover:bg-muted/40"
                  >
                    {isRenaming ? (
                      <div className="flex items-center gap-2">
                        <Input
                          autoFocus
                          value={renameDraft}
                          onChange={(event) => setRenameDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void handleRenameFavorite(site);
                            }
                            if (event.key === "Escape") {
                              setRenamingUrl(null);
                              setRenameDraft("");
                            }
                          }}
                          placeholder="Favorite name"
                          className="h-8 text-xs"
                        />
                        <button
                          onClick={() => void handleRenameFavorite(site)}
                          className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          title="Save"
                        >
                          <Check className="size-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setRenamingUrl(null);
                            setRenameDraft("");
                          }}
                          className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          title="Cancel"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            navigateToUrl(site.url);
                            setFavoritesListOpen(false);
                          }}
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          title={site.name || site.url}
                        >
                          <div className="truncate text-xs font-medium text-foreground">
                            {site.name?.trim() || site.url}
                          </div>
                          {site.name?.trim() ? (
                            <div className="truncate text-[11px] text-muted-foreground">{site.url}</div>
                          ) : null}
                        </button>
                        <button
                          onClick={() => {
                            setRenamingUrl(site.url);
                            setRenameDraft(site.name ?? "");
                          }}
                          type="button"
                          className="rounded-sm p-1 text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-foreground group-hover/item:opacity-100"
                          title="Rename"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          onClick={() => void handleDeleteFavorite(site)}
                          type="button"
                          className="rounded-sm p-1 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover/item:opacity-100"
                          title="Delete"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
