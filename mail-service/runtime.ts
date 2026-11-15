export * from "../shared/mail-normalization.js";
export { parseEmail } from "../server/ingestion/parsers/index.js";
export { parse as parseItauConsumptionEmail } from "../server/ingestion/parsers/itau-credit.js";
export { parse as parseItauDebitEmail } from "../server/ingestion/parsers/itau-debit.js";
export { parse as parseItauTransferEmail } from "../server/ingestion/parsers/itau-transfer.js";
export { parse as parseItauPaymentEmail } from "../server/ingestion/parsers/itau-payment.js";
export { parse as parseAutomationWalletEmail } from "../server/ingestion/parsers/automation-wallet.js";
