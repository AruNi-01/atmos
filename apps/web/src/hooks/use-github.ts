import { useState, useCallback, useEffect } from 'react';
import { useWebSocketStore } from './use-websocket';

export interface GithubContext {
  owner?: string;
  repo?: string;
  branch?: string;
}

// PR 列表
export function useGithubPRList({ owner, repo, branch }: GithubContext) {
  const send = useWebSocketStore(s => s.send);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!owner || !repo || !branch) return;
    setLoading(true);
    try {
      const result = await send('github_pr_list', { owner, repo, branch });
      setData(result);
    } catch (e) {
      console.error(e);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [owner, repo, branch, send]);

  useEffect(() => { 
    fetch(); 
  }, [fetch]);

  return { data, loading, refresh: fetch };
}

// CI 状态（in_progress 时自动轮询）
export function useGithubCIStatus({ owner, repo, branch }: GithubContext) {
  const send = useWebSocketStore(s => s.send);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!owner || !repo || !branch) return;
    
    let timer: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;

    const fetch = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await send('github_ci_status', { owner, repo, branch }) as any;
        if (!isMounted) return;
        setData(result);
        if (result?.status === 'in_progress' || result?.status === 'queued') {
          timer = setTimeout(fetch, 30_000); // 30s
        }
      } catch (e) {
        console.error(e);
      }
    };

    fetch();
    return () => { 
      isMounted = false;
      if (timer) clearTimeout(timer); 
    };
  }, [owner, repo, branch, send]);

  return data;
}

export function useGithubPRDetail(prNumber: number, owner?: string, repo?: string) {
  const send = useWebSocketStore(s => s.send);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!owner || !repo || !prNumber) return;
    setLoading(true);
    try {
      const result = await send('github_pr_detail', { owner, repo, pr_number: prNumber });
      setData(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [owner, repo, prNumber, send]);

  return { data, loading, fetch };
}
