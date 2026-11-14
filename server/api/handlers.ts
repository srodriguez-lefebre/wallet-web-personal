import { accountsHandlers } from "./modules/accounts.js";
import { analyticsHandlers } from "./modules/analytics.js";
import { authHandlers } from "./modules/auth.js";
import { budgetsHandlers } from "./modules/budgets.js";
import { cardsHandlers } from "./modules/cards.js";
import { categoriesHandlers } from "./modules/categories.js";
import { debtsHandlers } from "./modules/debts.js";
import { goalReservationsHandlers } from "./modules/goal-reservations.js";
import { goalsHandlers } from "./modules/goals.js";
import { ingestHandlers } from "./modules/ingest.js";
import { installmentPlansHandlers } from "./modules/installment-plans.js";
import { investmentsHandlers } from "./modules/investments.js";
import { recordTemplatesHandlers } from "./modules/record-templates.js";
import { recordsHandlers } from "./modules/records.js";
import { recurringDebtsHandlers } from "./modules/recurring-debts.js";
import { settingsHandlers } from "./modules/settings.js";
import { tagsHandlers } from "./modules/tags.js";
import { walletHandlers } from "./modules/wallet.js";

import type { HandlerMap } from "./handler-types.js";
export const handlers = {
  ...analyticsHandlers,
  ...accountsHandlers,
  ...categoriesHandlers,
  ...recordsHandlers,
  ...cardsHandlers,
  ...debtsHandlers,
  ...recurringDebtsHandlers,
  ...tagsHandlers,
  ...goalsHandlers,
  ...goalReservationsHandlers,
  ...budgetsHandlers,
  ...investmentsHandlers,
  ...installmentPlansHandlers,
  ...recordTemplatesHandlers,
  ...walletHandlers,
  ...settingsHandlers,
  ...authHandlers,
  ...ingestHandlers,
} satisfies HandlerMap;
