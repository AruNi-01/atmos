import { useEffect, useRef, useState } from "react";
import { METRIC_TWEEN_MS, morphSeries } from "@/features/token-usage/tween-series";

function signatureOf(rows: number[][]) {
  return rows.map((row) => row.join(",")).join(";");
}

/**
 * Redraw a chart from the previous silhouette onto the next scale.
 * The first paint of a new series is already the rescaled old shape, so the
 * axis can jump to the new unit without one frame of the old magnitude.
 */
export function useMorphedSeries(target: number[][], reduced: boolean) {
  const targetRef = useRef(target);
  targetRef.current = target;
  const signature = signatureOf(target);
  const [frame, setFrame] = useState({ signature, rows: target });
  const fromRef = useRef(frame.rows);
  const ready = useRef(false);

  let rows = frame.rows;
  if (frame.signature !== signature) {
    rows = reduced ? target : morphSeries(frame.rows, target, 0);
    setFrame({ signature, rows });
  }
  fromRef.current = rows;

  useEffect(() => {
    if (!ready.current) {
      ready.current = true;
      return;
    }
    const to = targetRef.current;
    if (reduced) {
      setFrame({ signature, rows: to });
      return;
    }
    const from = fromRef.current;
    let cancelled = false;
    const started = Date.now();
    let handle = 0;
    const tick = () => {
      if (cancelled) return;
      const t = Math.min(1, (Date.now() - started) / METRIC_TWEEN_MS);
      const next = morphSeries(from, to, t);
      setFrame((current) => (current.signature === signature ? { signature, rows: next } : current));
      if (t < 1) handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(handle);
    };
  }, [reduced, signature]);

  return rows;
}
