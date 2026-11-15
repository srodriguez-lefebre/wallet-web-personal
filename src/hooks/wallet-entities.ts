import { useInfiniteQuery, useQueries, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import type { WalletReference } from "@shared/reference-contract";
import type { ClientInput } from "@/services/api-client";
import type { MutationOperationId, WalletMutations } from "@/services/mutations";
import type { RecordQueryFilters } from "@/services/wallet-queries";

import {
  accountBalancesFromMetrics,
  buildReportViewModel,
  goalProgressFromMetrics,
} from "@/lib/wallet-read-model";
import { useWalletData } from "@/providers/wallet-query-provider";
import { mutationDefinitions } from "@/services/mutations";
import {
  accountBalancesQueryOptions,
  analyticsQueryOptions,
  balanceTrendQueryOptions,
  cardAgendaQueryOptions,
  cardCategoryUsageQueryOptions,
  cardLedgerQueryOptions,
  cardSummaryQueryOptions,
  goalProgressQueryOptions,
  recordsQueryOptions,
  referenceQueryOptions,
  reportDetailsQueryOptions,
} from "@/services/wallet-queries";

type EntityName = MutationOperationId extends `${infer Entity}.${string}` ? Entity : never;
type EntityMutations<Entity extends EntityName> = Pick<
  WalletMutations,
  Extract<MutationOperationId, `${Entity}.${string}`>
>;
type ReportRequest = NonNullable<ClientInput<"analytics.details">["query"]>;
const selectAccounts = (reference: WalletReference) => reference.accounts;
const selectGoals = (reference: WalletReference) => reference.goals;
const selectCards = (reference: WalletReference) => reference.creditCards;

/** Mutation bindings are derived from the exhaustive contract policy, not provider wrappers. */
export function useEntityMutations<Entity extends EntityName>(
  entity: Entity,
): EntityMutations<Entity> {
  const { mutations } = useWalletData();
  return useMemo(
    () =>
      Object.fromEntries(
        (Object.keys(mutationDefinitions) as MutationOperationId[])
          .filter((id) => id.startsWith(`${entity}.`))
          .map((id) => [id, mutations[id]]),
      ) as EntityMutations<Entity>,
    [entity, mutations],
  );
}
function useReferenceQuery<T = WalletReference>(select?: (reference: WalletReference) => T) {
  const { client } = useWalletData();
  return useQuery({ ...referenceQueryOptions(client), select });
}
export function useWalletReferenceQuery() {
  return useReferenceQuery();
}
export function useAccounts(readBalances = true) {
  const { client } = useWalletData();
  const reference = useReferenceQuery(selectAccounts);
  const metrics = useQuery({ ...accountBalancesQueryOptions(client), enabled: readBalances });
  const mutations = useEntityMutations("accounts");
  const balances = useMemo(
    () =>
      metrics.data
        ? accountBalancesFromMetrics({ accounts: reference.data ?? [] }, metrics.data)
        : [],
    [reference.data, metrics.data],
  );
  return {
    accounts: reference.data ?? [],
    balances,
    metrics,
    reference,
    mutations,
    isPending: reference.isPending || (readBalances && metrics.isPending),
    isError: reference.isError || metrics.isError,
  };
}
export function useGoals() {
  const { client } = useWalletData();
  const reference = useReferenceQuery(selectGoals);
  const metrics = useQuery(goalProgressQueryOptions(client));
  const mutations = useEntityMutations("goals");
  const progress = useMemo(
    () =>
      metrics.data ? goalProgressFromMetrics({ goals: reference.data ?? [] }, metrics.data) : [],
    [reference.data, metrics.data],
  );
  return {
    goals: reference.data ?? [],
    progress,
    metrics,
    reference,
    mutations,
    isPending: reference.isPending || metrics.isPending,
    isError: reference.isError || metrics.isError,
  };
}
export function useRecords(filters: RecordQueryFilters = {}, enabled = true) {
  const { client } = useWalletData();
  const query = useInfiniteQuery({ ...recordsQueryOptions(client, filters), enabled });
  const mutations = useEntityMutations("records");
  const records = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );
  const fetchNextPage = query.fetchNextPage;
  const loadMore = useCallback(async () => {
    await fetchNextPage({ cancelRefetch: false });
  }, [fetchNextPage]);
  return { records, query, mutations, loadMore, hasMore: query.hasNextPage };
}
export function useCardAgenda() {
  const { client } = useWalletData();
  return useQuery(cardAgendaQueryOptions(client));
}
export function useCard(id: string) {
  const { client } = useWalletData();
  const reference = useReferenceQuery(selectCards);
  const card = reference.data?.find((value) => value.id === id);
  const summary = useQuery({ ...cardSummaryQueryOptions(client, id), enabled: Boolean(card) });
  const ledger = useQuery({ ...cardLedgerQueryOptions(client, id), enabled: Boolean(card) });
  const movements = useEntityMutations("cardRecords");
  const payments = useEntityMutations("cardPayments");
  const statements = useEntityMutations("cardStatements");
  return {
    card,
    summary,
    ledger,
    movements,
    payments,
    statements,
    isPending: reference.isPending || Boolean(card && (summary.isPending || ledger.isPending)),
    isError: reference.isError || summary.isError || ledger.isError,
  };
}
export function useCards(selection?: ReportRequest, enabled = true) {
  const { client } = useWalletData();
  const reference = useReferenceQuery(selectCards);
  const cards = reference.data ?? [];
  const summaries = useQueries({
    queries: cards.map((card) => ({ ...cardSummaryQueryOptions(client, card.id), enabled })),
  });
  const categories = useQueries({
    queries: cards.map((card) => ({ ...cardCategoryUsageQueryOptions(client, card.id), enabled })),
  });
  const trends = useQueries({
    queries: selection
      ? cards.map((card) => ({
          ...reportDetailsQueryOptions(client, { ...selection, creditCardId: card.id }),
          enabled,
        }))
      : [],
  });
  const agenda = useQuery({ ...cardAgendaQueryOptions(client), enabled });
  const mutations = useEntityMutations("cards");
  const entries = cards.flatMap((_card, index) => {
    const summary = summaries[index]?.data;
    const categoryUsage = categories[index]?.data;
    const trend = trends[index]?.data;
    if (!summary || !categoryUsage || (selection && !trend)) return [];
    return [{ summary, categoryUsage, expenseTrend: trend?.expenseTrend ?? [] }];
  });
  const queries = [...summaries, ...categories, ...trends, agenda];
  return {
    cards,
    entries,
    agenda,
    mutations,
    isPending: !enabled || reference.isPending || queries.some((query) => query.isPending),
    isError: reference.isError || queries.some((query) => query.isError),
  };
}
export function useAnalytics(selection: Omit<ReportRequest, "creditCardId">, now: Date) {
  const { client } = useWalletData();
  const reference = useWalletReferenceQuery();
  const metrics = useQuery(accountBalancesQueryOptions(client));
  const totals = useQuery(analyticsQueryOptions(client, selection));
  const details = useQuery(reportDetailsQueryOptions(client, selection));
  const model = useMemo(
    () =>
      reference.data && metrics.data && totals.data && details.data
        ? buildReportViewModel(
            reference.data,
            metrics.data,
            totals.data,
            details.data,
            selection,
            now,
          )
        : undefined,
    [reference.data, metrics.data, totals.data, details.data, selection, now],
  );
  return {
    model,
    totals,
    details,
    metrics,
    isPending: reference.isPending || metrics.isPending || totals.isPending || details.isPending,
    isError: reference.isError || metrics.isError || totals.isError || details.isError,
  };
}
export function useAccountBalanceTrend(
  selection: NonNullable<ClientInput<"analytics.balanceTrend">["query"]>,
  enabled = true,
) {
  const { client } = useWalletData();
  return useQuery({ ...balanceTrendQueryOptions(client, selection), enabled });
}
