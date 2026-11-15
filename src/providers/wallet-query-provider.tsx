import { QueryClientProvider, useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import type { OperationResponse } from "@shared/api-contract";
import type { WalletClient } from "@/services/api-client";

import { removeStorage } from "@/lib/storage";
import { useAuth } from "@/providers/auth-provider";
import { createWalletMutations, type WalletMutations } from "@/services/mutations";
import { createWalletQueryClient, walletBootstrapQueryOptions } from "@/services/wallet-queries";

type Bootstrap = OperationResponse<"wallet.bootstrapReference">;
const DataContext = createContext<{
  client: WalletClient;
  mutations: WalletMutations;
  signal: AbortSignal;
} | null>(null);
const BootstrapContext = createContext<UseQueryResult<Bootstrap, Error> | null>(null);

function SessionQueries({ client, children }: PropsWithChildren<{ client: WalletClient }>) {
  const [cache] = useState(createWalletQueryClient);
  const [controller] = useState(() => new AbortController());
  const mounted = useRef(false);
  const bootstrap = useQuery(
    walletBootstrapQueryOptions(cache, client, { signal: controller.signal }),
    cache,
  );
  const mutations = useMemo(
    () => createWalletMutations(client, cache, { signal: controller.signal }),
    [client, cache, controller],
  );
  const data = useMemo(
    () => ({ client, mutations, signal: controller.signal }),
    [client, mutations, controller],
  );
  useEffect(() => {
    mounted.current = true;
    removeStorage("wallet-dataset-cache");
    return () => {
      mounted.current = false;
      // React StrictMode reconnects the same effect synchronously. A true session
      // unmount aborts bootstrap and clears all in-memory data before another task.
      queueMicrotask(() => {
        if (mounted.current) return;
        controller.abort();
        void cache.cancelQueries();
        cache.clear();
      });
    };
  }, [cache, controller]);
  return (
    <QueryClientProvider client={cache}>
      <DataContext.Provider value={data}>
        <BootstrapContext.Provider value={bootstrap}>{children}</BootstrapContext.Provider>
      </DataContext.Provider>
    </QueryClientProvider>
  );
}

/** Each session owns an isolated cache. Session tokens are never query keys or persisted data. */
export function WalletQueryProvider({ children }: PropsWithChildren) {
  const { client, token } = useAuth();
  if (!token) return null;
  return (
    <SessionQueries key={token} client={client}>
      {children}
    </SessionQueries>
  );
}
export function useWalletData() {
  const value = useContext(DataContext);
  if (!value) throw new Error("useWalletData requires WalletQueryProvider");
  return value;
}
export function useWalletBootstrap() {
  const value = useContext(BootstrapContext);
  if (!value) throw new Error("useWalletBootstrap requires WalletQueryProvider");
  return value;
}
