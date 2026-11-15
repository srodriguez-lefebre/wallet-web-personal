import { useIsFetching, useIsMutating, useQueryClient } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

/** Network feedback lives beside the route tree, outside financial state providers. */
export function WalletQueryStatus() {
  const client = useQueryClient();
  const cache = client.getQueryCache();
  const fetching = useIsFetching();
  const mutating = useIsMutating();
  const subscribe = useCallback((listener: () => void) => cache.subscribe(listener), [cache]);
  const snapshot = useCallback(
    () =>
      cache
        .getAll()
        .filter((query) => query.isActive() && query.state.status === "error")
        .map(
          (query) => `${query.queryHash}:${query.state.errorUpdatedAt}:${query.state.fetchStatus}`,
        )
        .join("|"),
    [cache],
  );
  useSyncExternalStore(subscribe, snapshot);
  const errors = cache
    .getAll()
    .filter((query) => query.isActive() && query.state.status === "error");
  return (
    <>
      {errors.length > 0 && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-amber-500 bg-card p-3 text-sm"
        >
          <span>
            Some wallet data could not be loaded or refreshed. Values may be out of date.{" "}
            {errors[0]?.state.error?.message}
          </span>
          <Button variant="outline" onClick={() => void client.refetchQueries({ type: "active" })}>
            Retry refresh
          </Button>
        </div>
      )}
      {fetching > 0 && mutating === 0 && (
        <div
          role="status"
          className="fixed bottom-4 left-4 z-50 rounded-md border bg-card px-3 py-2 text-xs text-muted-foreground shadow-sm lg:left-72"
        >
          Refreshing wallet...
        </div>
      )}
    </>
  );
}
