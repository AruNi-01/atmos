"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toastManager } from "@workspace/ui";
import { functionSettingsApi } from "@/api/ws-api";
import { useFunctionSettingsStore } from "@/features/settings/store/function-settings-store";
import {
  canonicalizeUrl,
  deriveFavoriteName,
  type FavoriteSite,
} from "../lib/preview-utils";

interface UsePreviewFavoritesArgs {
  currentPageTitle: string;
  normalizedActiveUrl: string;
}

export function usePreviewFavorites({
  currentPageTitle,
  normalizedActiveUrl,
}: UsePreviewFavoritesArgs) {
  const [favorites, setFavorites] = useState<FavoriteSite[]>([]);
  const [favoritePopoverOpen, setFavoritePopoverOpen] = useState(false);
  const [favoritesListOpen, setFavoritesListOpen] = useState(false);
  const [favoriteNameDraft, setFavoriteNameDraft] = useState("");
  const [favoriteSearch, setFavoriteSearch] = useState("");
  const [savingFavorite, setSavingFavorite] = useState(false);
  const [renamingUrl, setRenamingUrl] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const activeFavorite = useMemo(
    () => favorites.find((site) => canonicalizeUrl(site.url) === normalizedActiveUrl) ?? null,
    [favorites, normalizedActiveUrl],
  );

  const filteredFavorites = useMemo(() => {
    const query = favoriteSearch.trim().toLowerCase();
    if (!query) return favorites;

    return favorites.filter((site) => {
      const name = site.name?.toLowerCase() ?? "";
      const targetUrl = site.url.toLowerCase();
      return name.includes(query) || targetUrl.includes(query);
    });
  }, [favoriteSearch, favorites]);

  const persistFavorites = useCallback(async (nextFavorites: FavoriteSite[]) => {
    setSavingFavorite(true);
    try {
      await functionSettingsApi.update("inner_browser", "favorite_site", nextFavorites);
      setFavorites(nextFavorites);
      return true;
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Failed to save favorite",
        description: error instanceof Error ? error.message : "Unknown error",
      });
      return false;
    } finally {
      setSavingFavorite(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadFavorites = async () => {
      try {
        const settings = await useFunctionSettingsStore.getState().load();
        const sites = Array.isArray(settings.inner_browser?.favorite_site)
          ? settings.inner_browser.favorite_site.filter(
              (site): site is FavoriteSite =>
                !!site &&
                typeof site === "object" &&
                typeof site.url === "string" &&
                (typeof site.name === "string" || typeof site.name === "undefined"),
            )
          : [];

        if (mounted) {
          setFavorites(sites);
        }
      } catch (error) {
        console.error("Failed to load preview favorites:", error);
      }
    };

    void loadFavorites();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!favoritePopoverOpen) return;
    setFavoriteNameDraft(activeFavorite?.name ?? deriveFavoriteName(currentPageTitle, normalizedActiveUrl));
  }, [activeFavorite, currentPageTitle, favoritePopoverOpen, normalizedActiveUrl]);

  useEffect(() => {
    if (!favoritesListOpen) {
      setFavoriteSearch("");
      setRenamingUrl(null);
      setRenameDraft("");
    }
  }, [favoritesListOpen]);

  const handleAddFavorite = useCallback(async () => {
    if (!normalizedActiveUrl) return;

    const trimmedName = favoriteNameDraft.trim();
    const nextFavorite: FavoriteSite = {
      url: normalizedActiveUrl,
      name: trimmedName || undefined,
    };

    const nextFavorites = activeFavorite
      ? favorites.map((site) =>
          canonicalizeUrl(site.url) === normalizedActiveUrl ? nextFavorite : site,
        )
      : [nextFavorite, ...favorites.filter((site) => canonicalizeUrl(site.url) !== normalizedActiveUrl)];

    const ok = await persistFavorites(nextFavorites);
    if (!ok) return;

    setFavoritePopoverOpen(false);
    toastManager.add({
      type: "success",
      title: activeFavorite ? "Favorite updated" : "Favorite saved",
      description: trimmedName || nextFavorite.url,
    });
  }, [activeFavorite, favoriteNameDraft, favorites, normalizedActiveUrl, persistFavorites]);

  const handleRenameFavorite = useCallback(
    async (site: FavoriteSite) => {
      const nextName = renameDraft.trim();
      const nextFavorites = favorites.map((item) =>
        canonicalizeUrl(item.url) === canonicalizeUrl(site.url)
          ? { ...item, name: nextName || undefined }
          : item,
      );

      const ok = await persistFavorites(nextFavorites);
      if (!ok) return;

      setRenamingUrl(null);
      setRenameDraft("");
    },
    [favorites, persistFavorites, renameDraft],
  );

  const handleDeleteFavorite = useCallback(
    async (site: FavoriteSite) => {
      const nextFavorites = favorites.filter(
        (item) => canonicalizeUrl(item.url) !== canonicalizeUrl(site.url),
      );
      await persistFavorites(nextFavorites);
    },
    [favorites, persistFavorites],
  );

  return {
    activeFavorite,
    favoriteNameDraft,
    favoritePopoverOpen,
    favoriteSearch,
    favorites,
    favoritesListOpen,
    filteredFavorites,
    handleAddFavorite,
    handleDeleteFavorite,
    handleRenameFavorite,
    renameDraft,
    renamingUrl,
    savingFavorite,
    setFavoriteNameDraft,
    setFavoritePopoverOpen,
    setFavoriteSearch,
    setFavoritesListOpen,
    setRenameDraft,
    setRenamingUrl,
  };
}
