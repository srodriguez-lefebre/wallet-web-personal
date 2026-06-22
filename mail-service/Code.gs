const CONFIG = {
  pendingLabelName: 'Wallet/Pendiente',
  processedLabelName: 'Wallet/Procesado',
  maxThreads: 100
};

const INTEGRATION_NAME = 'gmail_apps_script';
const INTEGRATION_VERSION = 'wallet-web-personal-v1';

function processPendingEmails() {
  console.log('Iniciando procesamiento de correos pendientes.');
  const context = buildRuntimeContext();
  const threads = GmailApp.search([
    `label:"${CONFIG.pendingLabelName}"`,
    `-label:"${CONFIG.processedLabelName}"`,
    'newer_than:30d'
  ].join(' '), 0, CONFIG.maxThreads);
  console.log(`Se encontraron ${threads.length} thread(s) pendientes.`);

  threads.forEach(thread => {
    let processable = 0;
    let succeeded = 0;
    console.log(`Procesando thread ${thread.getId()} con ${thread.getMessageCount()} mensaje(s).`);
    thread.getMessages().forEach(message => {
      const consumption = parseConsumptionEmail(message);
      if (!consumption) {
        console.log(`Mensaje ${message.getId()} ignorado: formato no reconocido.`);
        return;
      }
      processable += 1;
      console.log(
        `Mensaje ${message.getId()} reconocido: ${consumption.source}, ` +
        `${consumption.currency} ${consumption.amount}, comercio "${consumption.merchant}".`
      );
      try {
        const result = sendWalletIngestionEvent(
          context,
          buildWalletIngestionPayload(thread, message, consumption, context.targets)
        );
        succeeded += 1;
        console.log(`Mensaje ${message.getId()} enviado correctamente: HTTP ${result.status}.`);
      } catch (error) {
        console.error(`El mensaje ${message.getId()} queda pendiente: ${error.message}`);
      }
    });

    // A thread is complete only after every message that we know how to parse succeeded.
    if (processable > 0 && succeeded === processable) {
      thread.addLabel(context.processedLabel);
      thread.removeLabel(context.pendingLabel);
      console.log(`Thread ${thread.getId()} procesado: ${succeeded}/${processable} mensaje(s) enviados.`);
    } else if (processable === 0) {
      console.warn(`Thread ${thread.getId()} sigue pendiente: no contiene mensajes reconocibles.`);
    } else {
      console.warn(`Thread ${thread.getId()} sigue pendiente: ${succeeded}/${processable} mensaje(s) enviados.`);
    }
  });

  console.log('Procesamiento de correos finalizado.');
}

function buildRuntimeContext() {
  const props = PropertiesService.getScriptProperties();
  const ingestUrl = props.getProperty('WALLET_INGEST_URL');
  const ingestToken = props.getProperty('WALLET_INGEST_TOKEN');
  if (!ingestUrl || !ingestToken) throw new Error('Faltan WALLET_INGEST_URL o WALLET_INGEST_TOKEN.');
  let targets = {};
  try { targets = JSON.parse(props.getProperty('WALLET_TARGETS_JSON') || '{}'); }
  catch (_) { throw new Error('WALLET_TARGETS_JSON no es JSON válido.'); }
  return {
    ingestUrl,
    ingestToken,
    targets,
    pendingLabel: getOrCreateLabel(CONFIG.pendingLabelName),
    processedLabel: getOrCreateLabel(CONFIG.processedLabelName)
  };
}

function resolveDestination(consumption, targets) {
  const cards = targets.cards || {};
  const digits = String(consumption.cardNumber || '').replace(/\D/g, '');
  const lastFour = digits.length >= 4 ? digits.slice(-4) : '';
  const alias = normalizeCardAlias(consumption.cardAlias || '');
  const match = cards[lastFour] || cards[alias] || {};
  return {
    creditCardId: match.creditCardId || undefined,
    accountId: match.accountId || targets.defaultAccountId || undefined
  };
}

function buildWalletIngestionPayload(thread, message, consumption, targets) {
  return {
    idempotencyKey: `gmail:${consumption.source}:${message.getId()}`,
    integration: { name: INTEGRATION_NAME, version: INTEGRATION_VERSION },
    email: {
      provider: 'gmail',
      messageId: message.getId(),
      threadId: thread.getId(),
      subject: message.getSubject() || '',
      from: message.getFrom() || '',
      date: message.getDate().toISOString()
    },
    transaction: {
      source: consumption.source,
      sourceLabel: consumption.sourceLabel || '',
      occurredAt: consumption.date.toISOString(),
      amount: consumption.amount,
      currency: consumption.currency,
      merchantRaw: consumption.merchant,
      cardAlias: consumption.cardAlias || '',
      cardBrand: consumption.cardBrand || '',
      cardNumber: consumption.cardNumber || '',
      paymentType: 'credit_card'
    },
    destination: resolveDestination(consumption, targets)
  };
}

function sendWalletIngestionEvent(context, payload) {
  const response = UrlFetchApp.fetch(context.ingestUrl, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${context.ingestToken}`, Accept: 'application/json' },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  if (code >= 200 && code < 300) {
    return { status: code, body: response.getContentText() };
  }
  throw new Error(`Wallet respondió HTTP ${code}: ${response.getContentText()}`);
}

function getOrCreateLabel(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}
