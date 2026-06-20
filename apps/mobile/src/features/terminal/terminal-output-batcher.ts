type TerminalOutputBatcherOptions = {
  clearTimeout?: (timer: ReturnType<typeof setTimeout>) => void;
  delayMs?: number;
  flush: (chunks: string[]) => void;
  setTimeout?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
};

export function createTerminalOutputBatcher({
  clearTimeout: clearTimer = clearTimeout,
  delayMs = 16,
  flush,
  setTimeout: setTimer = setTimeout,
}: TerminalOutputBatcherOptions) {
  let chunks: string[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flushNow = () => {
    if (timer) {
      clearTimer(timer);
      timer = null;
    }

    if (chunks.length === 0) return;
    const nextChunks = chunks;
    chunks = [];
    flush(nextChunks);
  };

  return {
    enqueue(chunk: string) {
      chunks.push(chunk);
      if (timer) return;

      timer = setTimer(flushNow, delayMs);
    },
    flush: flushNow,
    clear() {
      if (timer) {
        clearTimer(timer);
        timer = null;
      }
      chunks = [];
    },
  };
}
