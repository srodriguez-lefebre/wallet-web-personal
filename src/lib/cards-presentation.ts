import { differenceInCalendarDays, parseISO } from "date-fns";
import { calculateCreditCardStatementBalance } from "@shared/calculations";
import type {
  CreditCard,
  CreditCardStatement,
  WalletDataset,
} from "@shared/types";

export interface PendingCardStatement extends ReturnType<
  typeof calculateCreditCardStatementBalance
> {
  card: CreditCard;
  statement: CreditCardStatement;
  daysUntilDue: number;
  urgency: "overdue" | "today" | "soon" | "later";
  href: string;
}

function cardHistoryAsOf(dataset: WalletDataset, asOf: Date) {
  const payments = dataset.creditCardPayments.filter(
    (payment) => parseISO(payment.occurredAt) <= asOf,
  );
  const paymentIds = new Set(payments.map((payment) => payment.id));
  return {
    ...dataset,
    creditCardRecords: dataset.creditCardRecords.filter(
      (record) => parseISO(record.occurredAt) <= asOf,
    ),
    creditCardPayments: payments,
    creditCardPaymentAllocations: dataset.creditCardPaymentAllocations.filter(
      (allocation) => paymentIds.has(allocation.paymentId),
    ),
  };
}

export function cardStatementBalanceAsOf(
  dataset: WalletDataset,
  statement: CreditCardStatement,
  asOf = new Date(),
) {
  return calculateCreditCardStatementBalance(
    cardHistoryAsOf(dataset, asOf),
    statement,
  );
}

/** Read-only agenda for Cards and Dashboard. Includes archived cards and ignores
 * stale status flags. Caller should wait for complete history. Deadlines use the
 * viewer's calendar days; future movements/payments do not pay today's invoice.
 */
export function selectPendingCardStatements(
  dataset: WalletDataset,
  asOf = new Date(),
): PendingCardStatement[] {
  const current = cardHistoryAsOf(dataset, asOf);
  return dataset.creditCardStatements
    .flatMap((statement) => {
      const card = dataset.creditCards.find(
        (card) => card.id === statement.creditCardId,
      );
      if (!card || parseISO(statement.closedAt) > asOf) return [];
      const balance = calculateCreditCardStatementBalance(current, statement);
      if (balance.dueAmountInLimitCurrency < 0.005) return [];
      const daysUntilDue = differenceInCalendarDays(
        parseISO(statement.dueAt),
        asOf,
      );
      return [
        {
          card,
          statement,
          ...balance,
          daysUntilDue,
          urgency:
            daysUntilDue < 0
              ? ("overdue" as const)
              : daysUntilDue === 0
                ? ("today" as const)
                : daysUntilDue <= 7
                  ? ("soon" as const)
                  : ("later" as const),
          href: `/cards/${encodeURIComponent(card.id)}?statementId=${encodeURIComponent(statement.id)}`,
        },
      ];
    })
    .sort(
      (a, b) =>
        parseISO(a.statement.dueAt).getTime() -
          parseISO(b.statement.dueAt).getTime() ||
        a.statement.id.localeCompare(b.statement.id),
    );
}

export function selectCardStatement(
  dataset: WalletDataset,
  cardId: string,
  requestedId?: string | null,
  asOf = new Date(),
): CreditCardStatement | undefined {
  return (
    dataset.creditCardStatements.find(
      (statement) =>
        statement.creditCardId === cardId && statement.id === requestedId,
    ) ??
    selectPendingCardStatements(dataset, asOf).find(
      (entry) => entry.card.id === cardId,
    )?.statement
  );
}

export function cardLimitWarning(utilizationPercent: number) {
  if (!Number.isFinite(utilizationPercent) || utilizationPercent < 80)
    return null;
  return {
    severity:
      utilizationPercent >= 100 ? ("danger" as const) : ("warning" as const),
    message:
      utilizationPercent >= 100
        ? "Credit limit reached"
        : "Approaching credit limit",
    percent: Math.round(utilizationPercent),
  };
}
