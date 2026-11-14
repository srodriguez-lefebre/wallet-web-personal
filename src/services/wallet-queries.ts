import {
  QueryClient,
  infiniteQueryOptions,
  notifyManager,
  queryOptions,
} from "@tanstack/react-query";

import type { InfiniteData } from "@tanstack/react-query";
import type { OperationResponse } from "@shared/api-contract";
import type { ClientInput, WalletClient } from "./api-client";

type RecordsQuery = NonNullable<ClientInput<"records.list">["query"]>;
export type RecordQueryFilters = Omit<RecordsQuery, "cursor">;
export const referenceKey = ["reference"] as const;
export const defaultPageSize = 100;
const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
export function createWalletQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 }, mutations: { retry: false } },
  });
}
export function recordsKey(filters: RecordQueryFilters = {}) {
  return ["records", { ...filters, limit: filters.limit ?? defaultPageSize }] as const;
}
export function referenceQueryOptions(client: WalletClient, zone = timeZone()) {
  return queryOptions({
    queryKey: referenceKey,
    queryFn: ({ signal }) => client["wallet.reference"]({ query: { timeZone: zone }, signal }),
  });
}
export function recordsQueryOptions(client: WalletClient, filters: RecordQueryFilters = {}) {
  return infiniteQueryOptions({
    queryKey: recordsKey(filters),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      client["records.list"]({
        query: {
          ...filters,
          limit: filters.limit ?? defaultPageSize,
          cursor: pageParam ?? undefined,
        },
        signal,
      }),
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : null),
  });
}
export function ensureWalletBootstrap(
  cache: QueryClient,
  client: WalletClient,
  options: { signal?: AbortSignal; timeZone?: string; recordsLimit?: number } = {},
) {
  const limit = options.recordsLimit ?? defaultPageSize;
  return cache.fetchQuery({
    queryKey: ["bootstrap"],
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async () => {
      const data = await client["wallet.bootstrapReference"]({
        body: {
          recordsLimit: limit,
          recordsCursor: null,
          timeZone: options.timeZone ?? timeZone(),
        },
        signal: options.signal,
      });
      if (options.signal?.aborted) throw new DOMException("Session ended", "AbortError");
      notifyManager.batch(() => {
        cache.setQueryData(referenceKey, data.reference);
        cache.setQueryData<InfiniteData<OperationResponse<"records.list">, string | null>>(
          recordsKey({ limit }),
          { pages: [data.recordsPage], pageParams: [null] },
        );
      });
      return data;
    },
  });
}
export function analyticsQueryOptions(
  client: WalletClient,
  query: NonNullable<ClientInput<"analytics.summary">["query"]>,
) {
  return queryOptions({
    queryKey: ["analytics", query] as const,
    queryFn: ({ signal }) => client["analytics.summary"]({ query, signal }),
  });
}
export function cardSummaryQueryOptions(client: WalletClient, id: string) {
  return queryOptions({
    queryKey: ["card-summary", id] as const,
    queryFn: ({ signal }) => client["cards.summary"]({ params: { id }, signal }),
  });
}
export function cardStatementsQueryOptions(client: WalletClient, id: string) {
  return queryOptions({
    queryKey: ["card-statements", id] as const,
    queryFn: ({ signal }) => client["cardStatements.list"]({ params: { id }, signal }),
  });
}
export function cardRecordsQueryOptions(client: WalletClient, id: string) {
  return queryOptions({
    queryKey: ["card-records", id] as const,
    queryFn: ({ signal }) => client["cardRecords.list"]({ params: { id }, signal }),
  });
}

export function accountBalancesQueryOptions(
  client: WalletClient,
  query: NonNullable<ClientInput<"analytics.accountBalances">["query"]> = {},
) {
  const normalized = { ...query, timeZone: query.timeZone ?? timeZone() };
  return queryOptions({
    queryKey: ["account-balances", normalized] as const,
    queryFn: ({ signal }) => client["analytics.accountBalances"]({ query: normalized, signal }),
  });
}
export function goalProgressQueryOptions(client: WalletClient) {
  return queryOptions({
    queryKey: ["goal-progress"] as const,
    queryFn: ({ signal }) => client["analytics.goalProgress"]({ signal }),
  });
}
