import type { CurrencyCode } from "../../../shared/types.js";
import type { MailSource } from "../../../shared/mail-normalization.js";
export interface MailMessage {
  from: string;
  subject: string;
  date: string | Date;
  plainBody?: string;
  htmlBody?: string;
}
export interface NormalizedTransaction {
  source: MailSource;
  sourceLabel: string;
  paymentType: "credit_card" | "debit" | "transfer";
  amount: number;
  currency: CurrencyCode;
  merchant: string;
  cardAlias: string;
  cardBrand: string;
  cardNumber: string;
  date: Date;
  accountNumber?: string;
  destinationAccountNumber?: string;
  destinationBank?: string;
}
export interface EmailProcessorFlags {
  itau_process: boolean;
  Automation_wallet: boolean;
}
export type MailParser = (message: MailMessage) => NormalizedTransaction | null;
