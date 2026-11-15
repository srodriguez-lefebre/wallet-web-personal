import { parse as credit } from "./itau-credit.js";
import { parse as debit } from "./itau-debit.js";
import { parse as transfer } from "./itau-transfer.js";
import { parse as payment } from "./itau-payment.js";
import { parse as automation } from "./automation-wallet.js";

import type { EmailProcessorFlags, MailMessage, NormalizedTransaction } from "./types.js";
const defaults: EmailProcessorFlags = { itau_process: true, Automation_wallet: true };
export function parseEmail(
  message: MailMessage,
  flags: EmailProcessorFlags = defaults,
): NormalizedTransaction | null {
  if (flags.itau_process)
    for (const parse of [credit, debit, transfer, payment]) {
      const result = parse(message);
      if (result) return result;
    }
  return flags.Automation_wallet ? automation(message) : null;
}
export type { MailMessage, NormalizedTransaction, EmailProcessorFlags } from "./types.js";
