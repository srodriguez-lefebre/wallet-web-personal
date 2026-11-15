import { useCallback, useEffect, useRef, useState } from "react";

import type { ClientInput } from "@/services/api-client";

import { useCards } from "@/hooks/wallet-entities";
import { useWalletData } from "@/providers/wallet-query-provider";

type Selection = NonNullable<ClientInput<"analytics.details">["query"]>;

/** Refresh derived statements once per opening, including StrictMode's effect replay. */
export function useCardReads(selection: Selection) {
  const { mutations } = useWalletData();
  const pending = useRef<Promise<unknown> | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [refresh, setRefresh] = useState({ ready: false, error: "" });
  useEffect(() => {
    let alive = true;
    pending.current ??= mutations["cards.refreshStatements"]({});
    void pending.current.then(
      () => {
        if (alive) setRefresh({ ready: true, error: "" });
      },
      (error: unknown) => {
        if (alive)
          setRefresh({
            ready: false,
            error: error instanceof Error ? error.message : "Could not refresh card statements",
          });
      },
    );
    return () => {
      alive = false;
    };
  }, [mutations, attempt]);
  const retryRefresh = useCallback(() => {
    pending.current = null;
    setRefresh({ ready: false, error: "" });
    setAttempt((value) => value + 1);
  }, []);
  const cards = useCards(selection, refresh.ready);
  return {
    ...cards,
    refreshError: refresh.error,
    isRefreshing: !refresh.ready && !refresh.error,
    retryRefresh,
    isError: cards.isError || Boolean(refresh.error),
  };
}
