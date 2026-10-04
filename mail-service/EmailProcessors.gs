const EMAIL_PROCESSOR_FLAGS = { itau_process: true, Automation_wallet: true };

function parseConsumptionEmail(message, processorFlags) {
  const body = normalizeText(message.getPlainBody() || htmlToText(message.getBody()));
  const flags = processorFlags || EMAIL_PROCESSOR_FLAGS;
  const itauType = messageMatchesItau(message);
  if (flags.itau_process && itauType) {
    if (itauType === 'debit') return parseItauDebitEmail(message, body);
    if (itauType === 'transfer') return parseItauTransferEmail(message, body);
    return parseItauConsumptionEmail(message, body);
  }
  if (flags.Automation_wallet && messageMatchesAutomationWallet(body)) return parseAutomationWalletEmail(message, body);
  return null;
}

function messageMatchesItau(message) {
  const from = String(message.getFrom() || '').trim();
  const address = from.match(/<([^<>]+)>\s*$/);
  if ((address ? address[1].trim() : from).toLowerCase() !== 'comunicaciones@itau.com.uy') return null;
  const subject = normalizeCardAlias(message.getSubject());
  if (subject.includes('AVISO DE CONSUMO APROBADO CON TARJETA DE CREDITO')) return 'credit_card';
  if (subject.includes('AVISO DE CONSUMO APROBADO CON TARJETA DE DEBITO')) return 'debit';
  if (subject.includes('TRANSFERENCIA REALIZADA')) return 'transfer';
  return null;
}

function parseItauConsumptionEmail(message, body) {
  const amount = body.match(/Importe\s*:?\s*\*?\s*([0-9][0-9.,]*)\s*\*?\s*\*?\s*([A-Z]{3})/i);
  const merchant = body.match(/Comercio\s*:?\s*\*?\s*([^\n]+)/i);
  const card = body.match(/(VISA|MASTER(?:CARD)?|AMEX)[\s\S]{0,100}?nro\.?\s*([*\d]+)/i);
  if (!amount || !merchant || !trimTrailingFormatAsterisk(merchant[1])) throw new Error('Aviso de crédito Itaú incompleto.');
  return {
    source: 'itau_credit_card', sourceLabel: 'Auto Itaú',
    paymentType: 'credit_card', amount: parseAmount(amount[1]), currency: parseBankCurrency(amount[2]),
    merchant: trimTrailingFormatAsterisk(merchant[1]),
    cardBrand: card ? card[1].toUpperCase() : '', cardNumber: card ? card[2] : '',
    cardAlias: '', date: message.getDate()
  };
}

function parseItauDebitEmail(message, body) {
  const approved = /Se aprob[oó] un consumo de su tarjeta/i.test(body);
  const card = body.match(/tarjeta\s+(VISA|MASTER(?:CARD)?|AMEX)\s+terminada en\s+(\d{4})\b/i);
  const merchant = body.match(/Realizado en\s+(.+?)\s+Monto\s*:/i);
  const amount = body.match(/Monto\s*:\s*([0-9][0-9.,]*)\s+(D[oó]lares|Pesos|USD|UYU)\b/i);
  if (!approved || !card || !merchant || !amount) throw new Error('Aviso de débito Itaú incompleto.');
  return {
    source: 'itau_debit_card', sourceLabel: 'Auto Itaú', paymentType: 'debit',
    amount: parseAmount(amount[1]), currency: parseBankCurrency(amount[2]),
    merchant: merchant[1].trim(), cardBrand: card[1].toUpperCase(),
    cardNumber: `****${card[2]}`, cardAlias: '', date: message.getDate()
  };
}

function parseItauTransferEmail(message, body) {
  const origin = body.match(/Transferencia realizada desde la cuenta\s+(\*{4}\d{4})\b/i);
  const amountLine = body.match(/(?:^|\n)Importe\s*:\s*([^\n]+)/i);
  const destination = body.match(/(?:^|\n)Cuenta destino\s*:\s*(\d+)\s*(?:\n|$)/i);
  const bank = body.match(/(?:^|\n)Banco\s*\/\s*Instituci[oó]n destino\s*:\s*([^\n]+)/i);
  if (!origin || !amountLine || !destination || !bank || !bank[1].trim()) throw new Error('Aviso de transferencia Itaú incompleto.');
  const amount = amountLine[1].trim().match(/^(?:([A-Z]{3}|\$)\s*)?([0-9][0-9.,]*)(?:\s*([A-Z]{3}|\$))?$/i);
  if (!amount || !(amount[1] || amount[3]) || (amount[1] && amount[3] && parseBankCurrency(amount[1]) !== parseBankCurrency(amount[3]))) {
    throw new Error('Importe o moneda de transferencia Itaú inválidos.');
  }
  const destinationBank = bank[1].trim();
  return {
    source: 'itau_transfer', sourceLabel: 'Auto Itaú', paymentType: 'transfer',
    amount: parseAmount(amount[2]), currency: parseBankCurrency(amount[1] || amount[3]),
    merchant: `Transferencia a ${destinationBank} ****${destination[1].slice(-4)}`,
    accountNumber: origin[1], destinationAccountNumber: destination[1], destinationBank,
    cardBrand: '', cardNumber: '', cardAlias: '', date: message.getDate()
  };
}

function parseBankCurrency(raw) {
  const currency = normalizeCardAlias(raw);
  if (currency === 'DOLARES') return 'USD';
  if (currency === 'PESOS' || currency === '$') return 'UYU';
  if (['UYU', 'USD', 'EUR', 'BRL', 'ARS'].includes(currency)) return currency;
  throw new Error('Moneda bancaria no reconocida.');
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
  if (!alias || !merchant || !amount) throw new Error('Consumo Automation Wallet incompleto.');
  return {
    source: 'automation_wallet', sourceLabel: 'Auto Wallet', paymentType: 'credit_card',
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
  let value = raw.trim().replace(/\s/g, '');
  const comma = value.lastIndexOf(','), dot = value.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? ',' : '.';
    const boundary = value.lastIndexOf(decimal);
    const whole = value.slice(0, boundary), fraction = value.slice(boundary + 1);
    const grouped = decimal === ',' ? /^\d{1,3}(\.\d{3})+$/ : /^\d{1,3}(,\d{3})+$/;
    if (!grouped.test(whole) || !/^\d{1,2}$/.test(fraction)) throw new Error(`Importe inválido: ${raw}`);
    value = whole.replace(/[.,]/g, '') + '.' + fraction;
  } else if (comma >= 0 || dot >= 0) {
    const separator = comma >= 0 ? ',' : '.';
    const parts = value.split(separator);
    const grouped = /^\d{1,3}$/.test(parts[0]) && parts.slice(1).every(part => /^\d{3}$/.test(part));
    const decimal = parts.length === 2 && /^\d+$/.test(parts[0]) && /^\d{1,2}$/.test(parts[1]);
    if (!grouped && !decimal) throw new Error(`Importe inválido: ${raw}`);
    value = grouped ? parts.join('') : parts.join('.');
  } else if (!/^\d+$/.test(value)) {
    throw new Error(`Importe inválido: ${raw}`);
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`No pude convertir el importe: ${raw}`);
  return number;
}
