import { useCallback, useEffect, useState } from "react";

import type {
  CallReviewRepository,
  CallReviewSnapshot,
} from "./callReviewRepository";

export function useCallReviewData(repository: CallReviewRepository) {
  const [data, setData] = useState<CallReviewSnapshot | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      setData(await repository.load());
    } catch {
      setError(true);
    }
  }, [repository]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, error, reload: load };
}
