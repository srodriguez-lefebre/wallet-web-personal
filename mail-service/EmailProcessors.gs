const EMAIL_PROCESSOR_FLAGS = { itau_process: true, Automation_wallet: true };

function parseConsumptionEmail(message, processorFlags) {
  const body = normalizeText(message.getPlainBody() || htmlToText(message.getBody()));
  const flags = processorFlags || EMAIL_PROCESSOR_FLAGS;
  if (flags.itau_process && messageMatchesItau(message)) return parseItauConsumptionEmail(message, body);
  if (flags.Automation_wallet && messageMatchesAutomationWallet(body)) return parseAutomationWalletEmail(message, body);
  return null;
}

function messageMatchesItau(message) {
  return (message.getFrom() || '').includes('comunicaciones@itau.com.uy')
    && (message.getSubject() || '').includes('Aviso de consumo aprobado con tarjeta de crédito');
}

function parseItauConsumptionEmail(message, body) {
  const amount = body.match(/Importe\s*:?\s*\*?\s*([0-9][0-9.,]*)\s*\*?\s*\*?\s*([A-Z]{3})/i);
  const merchant = body.match(/Comercio\s*:?\s*\*?\s*([^\n]+)/i);
  const card = body.match(/(VISA|MASTER(?:CARD)?|AMEX)[\s\S]{0,100}?nro\.?\s*([*\d]+)/i);
  if (!amount || !merchant) return null;
  return {
    source: 'itau_credit_card', sourceLabel: 'Auto Itaú',
    amount: parseAmount(amount[1]), currency: amount[2].toUpperCase(),
    merchant: trimTrailingFormatAsterisk(merchant[1]),
    cardBrand: card ? card[1].toUpperCase() : '', cardNumber: card ? card[2] : '',
    cardAlias: '', date: message.getDate()
  };
}

function messageMatchesAutomationWallet(body) {
  return /Tarjeta\s*\/\s*Pase\s*:/i.test(body)
    && /Nombre\s*\/\s*Contraparte\s*:/i.test(body)
    && /Monto\s*:/i.test(body);
}

function parseAutomationWalletEmail(message, body) {
  const alias = body.match(/Tarjeta\s*\/\s*Pase\s*:\s*([^\n|]+)/i);
  const merchant = body.match(/Nombre\s*\/\s*Contraparte\s*:\s*([^\n|]+)/i);
  const amount = body.match(/Monto\s*:\s*(?:([A-Z]{3})\s*)?\$?\s*([0-9][0-9.,]*)/i);
  if (!alias || !merchant || !amount) return null;
  return {
    source: 'automation_wallet', sourceLabel: 'Auto Wallet',
    amount: parseAmount(amount[2]), currency: (amount[1] || 'UYU').toUpperCase(),
    merchant: merchant[1].trim(), cardAlias: alias[1].trim(),
    cardBrand: '', cardNumber: '', date: message.getDate()
  };
}

function normalizeCardAlias(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
}

function normalizeText(value) {
  return String(value || '').replace(/\u00A0/g, ' ').replace(/\u200B/g, '').replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').trim();
}

function htmlToText(html) {
  return String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>|<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&');
}

function trimTrailingFormatAsterisk(value) {
  const trimmed = value.trim();
  return trimmed.endsWith('*') ? trimmed.slice(0, -1).trim() : trimmed;
}

function parseAmount(raw) {
  let value = raw.trim();
  if (value.includes(',') && value.includes('.')) value = value.replace(/\./g, '').replace(',', '.');
  else if (value.includes(',')) value = value.replace(',', '.');
  const number = Number(value);
  if (isNaN(number)) throw new Error(`No pude convertir el importe: ${raw}`);
  return number;
}
