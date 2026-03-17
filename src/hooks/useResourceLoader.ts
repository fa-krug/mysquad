import { useState, useEffect, useCallback, useRef } from "react";

interface UseResourceLoaderResult<T> {
  data: T;
  setData: React.Dispatch<React.SetStateAction<T>>;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useResourceLoader<T>(
  fetcher: () => Promise<T>,
  initialValue: T,
  deps: React.DependencyList = [],
): UseResourceLoaderResult<T> {
  const [data, setData] = useState<T>(initialValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      if (!cancelRef.current) setData(result);
    } catch (err) {
      if (!cancelRef.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!cancelRef.current) setLoading(false);
    }
  }, deps);

  useEffect(() => {
    cancelRef.current = false;
    load();
    return () => {
      cancelRef.current = true;
    };
  }, [load]);

  return { data, setData, loading, error, reload: load };
}
