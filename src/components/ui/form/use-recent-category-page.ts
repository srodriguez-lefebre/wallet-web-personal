import { InfiniteQueryObserver, QueryClientContext } from "@tanstack/react-query";
import { useCallback, useContext, useSyncExternalStore } from "react";

import type { InfiniteData } from "@tanstack/react-query";
import type { OperationResponse } from "@shared/api-contract";

import { useOptionalWalletData } from "@/providers/wallet-query-provider";
import { recordsKey, recordsQueryOptions } from "@/services/wallet-queries";

type RecordPage = OperationResponse<"records.list">;

export function useRecentCategoryPage(enabled: boolean) {
  const cache = useContext(QueryClientContext);
  const client = useOptionalWalletData()?.client;
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!cache || !enabled) return () => {};
      if (!client) return cache.getQueryCache().subscribe(listener);
      return new InfiniteQueryObserver(cache, recordsQueryOptions(client)).subscribe(listener);
    },
    [cache, client, enabled],
  );
  const snapshot = () =>
    enabled ? cache?.getQueryData<InfiniteData<RecordPage>>(recordsKey())?.pages[0] : undefined;
  return useSyncExternalStore(subscribe, snapshot, () => undefined);
}
