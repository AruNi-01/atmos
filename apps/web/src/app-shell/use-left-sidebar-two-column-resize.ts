import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ImperativePanelHandle } from '@workspace/ui';

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
    const [isTwoColumnPrimaryCollapsed, setIsTwoColumnPrimaryCollapsed] = useState(false);
    const [twoColumnPrimarySizes, setTwoColumnPrimarySizes] = useState<Record<string, number>>({
        project: 40,
        time: 38,
        status: 38,
    });
    const previousExpandedLeftSidebarSizeRef = useRef<number | null>(null);
    const syncedCollapsedLeftSidebarSizeRef = useRef<number | null>(null);
    const previousTwoColumnPrimaryCollapsedRef = useRef(isTwoColumnPrimaryCollapsed);
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
        isTwoColumnDividerDraggingRef.current = dragging;
        if (!dragging) {
            const pending = pendingTwoColumnPrimarySizeRef.current;
            pendingTwoColumnPrimarySizeRef.current = null;
            if (pending != null && pending > 12) {
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
        if (!isTwoColumnSidebar) return;
        const id = requestAnimationFrame(() => {
            const panel = twoColumnPrimaryPanelRef.current;
            if (!panel) return;
            const collapsed = panel.isCollapsed();
            setIsTwoColumnPrimaryCollapsed((prev) => (prev === collapsed ? prev : collapsed));
        });
        return () => cancelAnimationFrame(id);
    }, [isTwoColumnSidebar, twoColumnLayoutKey]);

    useEffect(() => {
        if (!isTwoColumnSidebar || isLeftCollapsed || leftSidebarSize <= 0) {
            previousExpandedLeftSidebarSizeRef.current = null;
            syncedCollapsedLeftSidebarSizeRef.current = null;
            previousTwoColumnPrimaryCollapsedRef.current = isTwoColumnPrimaryCollapsed;
            return;
        }

        const wasCollapsed = previousTwoColumnPrimaryCollapsedRef.current;
        previousTwoColumnPrimaryCollapsedRef.current = isTwoColumnPrimaryCollapsed;
        if (wasCollapsed === isTwoColumnPrimaryCollapsed) {
            return;
        }

        const secondaryRatio = Math.max(0.24, (100 - currentTwoColumnPrimarySize) / 100);
        let nextSize: number | null = null;

        if (isTwoColumnPrimaryCollapsed) {
            previousExpandedLeftSidebarSizeRef.current = leftSidebarSize;
            nextSize = clampOuterLeftSidebarSize(leftSidebarSize * secondaryRatio);
            syncedCollapsedLeftSidebarSizeRef.current = nextSize;
        } else {
            const syncedCollapsedSize = syncedCollapsedLeftSidebarSizeRef.current;
            const userResizedWhileCollapsed =
                syncedCollapsedSize != null && Math.abs(leftSidebarSize - syncedCollapsedSize) > 0.5;

            nextSize = userResizedWhileCollapsed
                ? clampOuterLeftSidebarSize(leftSidebarSize / secondaryRatio)
                : (previousExpandedLeftSidebarSizeRef.current ?? clampOuterLeftSidebarSize(leftSidebarSize / secondaryRatio));

            previousExpandedLeftSidebarSizeRef.current = null;
            syncedCollapsedLeftSidebarSizeRef.current = null;
        }

        if (nextSize == null || Math.abs(nextSize - leftSidebarSize) < 0.5) {
            return;
        }

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
