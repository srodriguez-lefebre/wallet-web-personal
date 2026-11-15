// Runtime logic is generated from TypeScript by npm run mail:build.
const EMAIL_PROCESSOR_FLAGS = { itau_process: true, Automation_wallet: true };
function asMailMessage(message, body) {
  const plainBody = body || message.getPlainBody();
  return { from:message.getFrom(),subject:message.getSubject(),date:message.getDate(),plainBody:plainBody,htmlBody:plainBody ? undefined : message.getBody() };
}
function parseConsumptionEmail(message, processorFlags) { return WalletMail.parseEmail(asMailMessage(message), processorFlags || EMAIL_PROCESSOR_FLAGS); }
function parseItauConsumptionEmail(message,body) { return WalletMail.parseItauConsumptionEmail(asMailMessage(message,body)); }
function parseItauDebitEmail(message,body) { return WalletMail.parseItauDebitEmail(asMailMessage(message,body)); }
function parseItauTransferEmail(message,body) { return WalletMail.parseItauTransferEmail(asMailMessage(message,body)); }
function parseItauPaymentEmail(message,body) { return WalletMail.parseItauPaymentEmail(asMailMessage(message,body)); }
function parseAutomationWalletEmail(message,body) { return WalletMail.parseAutomationWalletEmail(asMailMessage(message,body)); }
function normalizeCardAlias(value) { return WalletMail.normalizeCardAlias(value); }
function normalizeText(value) { return WalletMail.normalizeText(value); }
function htmlToText(value) { return WalletMail.htmlToText(value); }
function trimTrailingFormatAsterisk(value) { return WalletMail.trimTrailingFormatAsterisk(value); }
function parseAmount(value) { return WalletMail.parseAmount(value); }
function parseBankCurrency(value) { return WalletMail.parseBankCurrency(value); }
