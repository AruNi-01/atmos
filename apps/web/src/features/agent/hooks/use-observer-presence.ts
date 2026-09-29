"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  OBSERVER_MOTION_MS,
  nextTimedExits,
  type TimedExit,
} from "@/features/agent/lib/observer-graph-motion";

function idsKey<T extends { id: string }>(items: T[]): string {
  return items.map((item) => item.id).join("\n");
}

function exitsKey<T extends { id: string }>(records: TimedExit<T>[]): string {
  return records.map((record) => `${record.item.id}:${record.until}`).join("\n");
}

export function useObserverPresence<N extends { id: string }, E extends { id: string }>(
  liveNodes: N[],
  liveEdges: E[],
): {
  exitingNodes: N[];
  exitingEdges: E[];
} {
  const [exitingNodes, setExitingNodes] = useState<TimedExit<N>[]>([]);
  const [exitingEdges, setExitingEdges] = useState<TimedExit<E>[]>([]);
  const prevNodesRef = useRef(liveNodes);
  const prevEdgesRef = useRef(liveEdges);

  const prevNodes = prevNodesRef.current;
  const prevEdges = prevEdgesRef.current;
  const nodeIdsChanged = idsKey(prevNodes) !== idsKey(liveNodes);
  const edgeIdsChanged = idsKey(prevEdges) !== idsKey(liveEdges);

  let nodeExits = exitingNodes;
  let edgeExits = exitingEdges;
  if (nodeIdsChanged || edgeIdsChanged) {
    const now = Date.now();
    if (nodeIdsChanged) {
      nodeExits = nextTimedExits({
        previousLive: prevNodes,
        nextLive: liveNodes,
        exiting: exitingNodes,
        now,
        durationMs: OBSERVER_MOTION_MS,
      });
    }
    if (edgeIdsChanged) {
      edgeExits = nextTimedExits({
        previousLive: prevEdges,
        nextLive: liveEdges,
        exiting: exitingEdges,
        now,
        durationMs: OBSERVER_MOTION_MS,
      });
    }
  }
  prevNodesRef.current = liveNodes;
  prevEdgesRef.current = liveEdges;
  if (exitsKey(nodeExits) !== exitsKey(exitingNodes)) setExitingNodes(nodeExits);
  if (exitsKey(edgeExits) !== exitsKey(exitingEdges)) setExitingEdges(edgeExits);

  const exitKey = `${exitsKey(nodeExits)}\n${exitsKey(edgeExits)}`;

  useEffect(() => {
    const untils = [...nodeExits, ...edgeExits].map((record) => record.until);
    if (untils.length === 0) return;
    const delay = Math.max(0, Math.min(...untils) - Date.now());
    const timer = window.setTimeout(() => {
      const now = Date.now();
      setExitingNodes((current) => current.filter((record) => record.until > now));
      setExitingEdges((current) => current.filter((record) => record.until > now));
    }, delay + 1);
    return () => window.clearTimeout(timer);
  }, [exitKey, nodeExits, edgeExits]);

  return useMemo(() => {
    const liveNodeIds = new Set(liveNodes.map((node) => node.id));
    const liveEdgeIds = new Set(liveEdges.map((edge) => edge.id));
    return {
      exitingNodes: nodeExits
        .filter((record) => !liveNodeIds.has(record.item.id))
        .map((record) => record.item),
      exitingEdges: edgeExits
        .filter((record) => !liveEdgeIds.has(record.item.id))
        .map((record) => record.item),
    };
  }, [liveEdges, liveNodes, nodeExits, edgeExits]);
}
