import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAppStorage } from '@atmos/shared';
import type { ImperativePanelHandle } from '@workspace/ui';

import { logSidebarLayout } from '@/app-shell/sidebar-layout-debug';
import {
    DEFAULT_COLLAPSED_TWO_COLUMN_LEFT_SIDEBAR_SIZE,
    DEFAULT_LEFT_SIDEBAR_SIZE,
    ROOT_SIDEBAR_LAYOUT_AUTO_SAVE_ID,
} from '@/app-shell/sidebar-layout-constants';
import type { SidebarGroupingMode } from '@/app-shell/sidebar/workspace-status';

interface UseLeftSidebarTwoColumnResizeParams {
    groupingMode: SidebarGroupingMode;
    isLeftCollapsed: boolean;
    isProjectTwoColumn: boolean;
    isTwoColumnSidebar: boolean;
    leftSidebarSize: number;
    resizeLeftSidebar: (size: number) => void;
}

export function useLeftSidebarTwoColumnResize({
    groupingMode,
    isLeftCollapsed,
    isProjectTwoColumn,
    isTwoColumnSidebar,
    leftSidebarSize,
    resizeLeftSidebar,
}: UseLeftSidebarTwoColumnResizeParams) {
    const storage = useAppStorage();
    const [isTwoColumnPrimaryCollapsed, setIsTwoColumnPrimaryCollapsed] = useState(false);
    const [twoColumnPrimarySizes, setTwoColumnPrimarySizes] = useState<Record<string, number>>({
        project: 40,
        time: 38,
        status: 38,
    });
    const previousExpandedLeftSidebarSizeRef = useRef<number | null>(null);
    const syncedCollapsedLeftSidebarSizeRef = useRef<number | null>(null);
    const collapsedLeftSidebarSizesRef = useRef<Record<string, number>>({});
    const previousTwoColumnPrimaryCollapsedRef = useRef(isTwoColumnPrimaryCollapsed);
    const hasSyncedTwoColumnPrimaryCollapsedRef = useRef(false);
    const initializedTwoColumnLayoutKeyRef = useRef<string | null>(null);
    const rootLayoutWasPersistedRef = useRef(
        storage.getItem(`react-resizable-panels:${ROOT_SIDEBAR_LAYOUT_AUTO_SAVE_ID}`) != null,
    );
    const isTwoColumnDividerDraggingRef = useRef(false);
    const pendingTwoColumnPrimarySizeRef = useRef<number | null>(null);
    const twoColumnPrimaryPanelRef = useRef<ImperativePanelHandle>(null);

    const twoColumnLayoutKey = isProjectTwoColumn ? 'project' : groupingMode;
    const defaultTwoColumnPrimarySize = isProjectTwoColumn ? 40 : 38;
    const currentTwoColumnPrimarySize = twoColumnPrimarySizes[twoColumnLayoutKey] ?? defaultTwoColumnPrimarySize;
    const clampOuterLeftSidebarSize = useCallback((size: number) => Math.min(50, Math.max(10, size)), []);

    const toggleTwoColumnPrimaryPanel = useCallback(() => {
        const panel = twoColumnPrimaryPanelRef.current;
        if (!panel) return;
        if (panel.isCollapsed()) {
            panel.expand();
        } else {
            panel.collapse();
        }
    }, []);

    const handleTwoColumnDividerDragging = useCallback((dragging: boolean) => {
        logSidebarLayout('TWO_COLUMN_DIVIDER_DRAG', 'Two-column divider drag state changed', {
            dragging,
            twoColumnLayoutKey,
            pendingPrimarySize: pendingTwoColumnPrimarySizeRef.current,
        });
        isTwoColumnDividerDraggingRef.current = dragging;
        if (!dragging) {
            const pending = pendingTwoColumnPrimarySizeRef.current;
            pendingTwoColumnPrimarySizeRef.current = null;
            if (pending != null && pending > 12) {
                logSidebarLayout('TWO_COLUMN_PRIMARY_COMMIT', 'Committing pending primary size after drag', {
                    twoColumnLayoutKey,
                    pending,
                });
                setTwoColumnPrimarySizes((prev) => {
                    if (prev[twoColumnLayoutKey] === pending) {
                        return prev;
                    }
                    return {
                        ...prev,
                        [twoColumnLayoutKey]: pending,
                    };
                });
            }
        }
    }, [twoColumnLayoutKey]);

    const handleTwoColumnPrimaryResize = useCallback((size: number) => {
        logSidebarLayout('TWO_COLUMN_PRIMARY_RESIZE', 'Primary two-column panel resized', {
            twoColumnLayoutKey,
            size,
            dragging: isTwoColumnDividerDraggingRef.current,
        });
        // Collapsed primary reports ~0; collapsible snap handles collapse, so do not persist it.
        if (size < 1) {
            pendingTwoColumnPrimarySizeRef.current = null;
            return;
        }

        if (isTwoColumnDividerDraggingRef.current) {
            pendingTwoColumnPrimarySizeRef.current = size;
            return;
        }

        setTwoColumnPrimarySizes((prev) => {
            if (prev[twoColumnLayoutKey] === size) {
                return prev;
            }

            return {
                ...prev,
                [twoColumnLayoutKey]: size,
            };
        });
    }, [twoColumnLayoutKey]);

    useLayoutEffect(() => {
        if (!isTwoColumnSidebar) {
            hasSyncedTwoColumnPrimaryCollapsedRef.current = false;
            return;
        }

        const syncCollapsedState = () => {
            const panel = twoColumnPrimaryPanelRef.current;
            if (!panel) return false;
            const collapsed = panel.isCollapsed();
            logSidebarLayout('TWO_COLUMN_RAF_SYNC', 'RAF synchronized primary collapsed state from panel', {
                twoColumnLayoutKey,
                collapsed,
                previousCollapsedRef: previousTwoColumnPrimaryCollapsedRef.current,
                initializedLayoutKey: initializedTwoColumnLayoutKeyRef.current,
            });
            if (initializedTwoColumnLayoutKeyRef.current !== twoColumnLayoutKey) {
                previousTwoColumnPrimaryCollapsedRef.current = collapsed;
            }
            setIsTwoColumnPrimaryCollapsed((prev) => (prev === collapsed ? prev : collapsed));
            hasSyncedTwoColumnPrimaryCollapsedRef.current = true;
            return true;
        };

        if (syncCollapsedState()) {
            return;
        }

        const id = requestAnimationFrame(() => {
            syncCollapsedState();
        });
        return () => cancelAnimationFrame(id);
    }, [isTwoColumnSidebar, twoColumnLayoutKey]);

    useEffect(() => {
        logSidebarLayout('TWO_COLUMN_EFFECT_ENTER', 'Two-column resize effect entered', {
            twoColumnLayoutKey,
            isTwoColumnSidebar,
            isLeftCollapsed,
            leftSidebarSize,
            isTwoColumnPrimaryCollapsed,
            currentTwoColumnPrimarySize,
            initializedLayoutKey: initializedTwoColumnLayoutKeyRef.current,
            previousCollapsedRef: previousTwoColumnPrimaryCollapsedRef.current,
            hasSyncedTwoColumnPrimaryCollapsed: hasSyncedTwoColumnPrimaryCollapsedRef.current,
        });

        if (!isTwoColumnSidebar || isLeftCollapsed || leftSidebarSize <= 0) {
            logSidebarLayout('TWO_COLUMN_EFFECT_RESET', 'Two-column resize effect reset refs', {
                twoColumnLayoutKey,
                isTwoColumnSidebar,
                isLeftCollapsed,
                leftSidebarSize,
                isTwoColumnPrimaryCollapsed,
            });
            previousExpandedLeftSidebarSizeRef.current = null;
            syncedCollapsedLeftSidebarSizeRef.current = null;
            previousTwoColumnPrimaryCollapsedRef.current = isTwoColumnPrimaryCollapsed;
            return;
        }

        if (!hasSyncedTwoColumnPrimaryCollapsedRef.current) {
            logSidebarLayout('TWO_COLUMN_EFFECT_UNSYNCED_SKIP', 'Skipping resize before primary collapsed state sync', {
                twoColumnLayoutKey,
                leftSidebarSize,
                isTwoColumnPrimaryCollapsed,
            });
            return;
        }

        if (initializedTwoColumnLayoutKeyRef.current !== twoColumnLayoutKey) {
            logSidebarLayout('TWO_COLUMN_EFFECT_INIT_SKIP', 'Skipping first resize effect for layout key', {
                twoColumnLayoutKey,
                leftSidebarSize,
                isTwoColumnPrimaryCollapsed,
                previousCollapsedRef: previousTwoColumnPrimaryCollapsedRef.current,
                rootLayoutWasPersisted: rootLayoutWasPersistedRef.current,
            });
            initializedTwoColumnLayoutKeyRef.current = twoColumnLayoutKey;
            previousTwoColumnPrimaryCollapsedRef.current = isTwoColumnPrimaryCollapsed;

            if (
                isTwoColumnPrimaryCollapsed &&
                !rootLayoutWasPersistedRef.current &&
                Math.abs(leftSidebarSize - DEFAULT_LEFT_SIDEBAR_SIZE) < 0.5
            ) {
                const nextSize = clampOuterLeftSidebarSize(DEFAULT_COLLAPSED_TWO_COLUMN_LEFT_SIDEBAR_SIZE);
                rootLayoutWasPersistedRef.current = true;
                logSidebarLayout('TWO_COLUMN_INIT_COLLAPSED_DEFAULT', 'Applying first-run collapsed sidebar default', {
                    twoColumnLayoutKey,
                    leftSidebarSize,
                    nextSize,
                });
                resizeLeftSidebar(nextSize);
            }
            return;
        }

        const wasCollapsed = previousTwoColumnPrimaryCollapsedRef.current;
        previousTwoColumnPrimaryCollapsedRef.current = isTwoColumnPrimaryCollapsed;
        if (wasCollapsed === isTwoColumnPrimaryCollapsed) {
            logSidebarLayout('TWO_COLUMN_EFFECT_NOOP', 'Primary collapsed state unchanged', {
                twoColumnLayoutKey,
                wasCollapsed,
                isTwoColumnPrimaryCollapsed,
                leftSidebarSize,
            });
            return;
        }

        const secondaryRatio = Math.max(0.24, (100 - currentTwoColumnPrimarySize) / 100);
        let nextSize: number | null = null;

        if (isTwoColumnPrimaryCollapsed) {
            previousExpandedLeftSidebarSizeRef.current = leftSidebarSize;
            nextSize = clampOuterLeftSidebarSize(
                collapsedLeftSidebarSizesRef.current[twoColumnLayoutKey] ?? DEFAULT_COLLAPSED_TWO_COLUMN_LEFT_SIDEBAR_SIZE,
            );
            syncedCollapsedLeftSidebarSizeRef.current = nextSize;
        } else {
            const syncedCollapsedSize = syncedCollapsedLeftSidebarSizeRef.current;
            const userResizedWhileCollapsed =
                syncedCollapsedSize != null && Math.abs(leftSidebarSize - syncedCollapsedSize) > 0.5;

            if (userResizedWhileCollapsed) {
                collapsedLeftSidebarSizesRef.current[twoColumnLayoutKey] = leftSidebarSize;
            }

            nextSize = userResizedWhileCollapsed
                ? clampOuterLeftSidebarSize(leftSidebarSize / secondaryRatio)
                : (previousExpandedLeftSidebarSizeRef.current ?? clampOuterLeftSidebarSize(leftSidebarSize / secondaryRatio));

            previousExpandedLeftSidebarSizeRef.current = null;
            syncedCollapsedLeftSidebarSizeRef.current = null;
        }

        if (nextSize == null || Math.abs(nextSize - leftSidebarSize) < 0.5) {
            logSidebarLayout('TWO_COLUMN_RESIZE_SKIP', 'Computed resize was too small or null', {
                twoColumnLayoutKey,
                nextSize,
                leftSidebarSize,
                secondaryRatio,
                wasCollapsed,
                isTwoColumnPrimaryCollapsed,
            });
            return;
        }

        logSidebarLayout('TWO_COLUMN_REQUEST_ROOT_RESIZE', 'Requesting root sidebar resize from two-column transition', {
            twoColumnLayoutKey,
            leftSidebarSize,
            nextSize,
            secondaryRatio,
            wasCollapsed,
            isTwoColumnPrimaryCollapsed,
            currentTwoColumnPrimarySize,
            previousExpandedLeftSidebarSize: previousExpandedLeftSidebarSizeRef.current,
            syncedCollapsedLeftSidebarSize: syncedCollapsedLeftSidebarSizeRef.current,
        });

        const frame = window.requestAnimationFrame(() => {
            resizeLeftSidebar(nextSize!);
        });

        return () => window.cancelAnimationFrame(frame);
    }, [
        clampOuterLeftSidebarSize,
        currentTwoColumnPrimarySize,
        isLeftCollapsed,
        isTwoColumnPrimaryCollapsed,
        isTwoColumnSidebar,
        leftSidebarSize,
        resizeLeftSidebar,
        twoColumnLayoutKey,
    ]);

    return {
        currentTwoColumnPrimarySize,
        handleTwoColumnDividerDragging,
        handleTwoColumnPrimaryResize,
        isTwoColumnPrimaryCollapsed,
        setIsTwoColumnPrimaryCollapsed,
        toggleTwoColumnPrimaryPanel,
        twoColumnPrimaryPanelRef,
    };
}
