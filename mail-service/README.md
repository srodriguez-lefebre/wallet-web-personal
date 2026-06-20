# Mail service (Google Apps Script)

Copiar `Code.gs` y `EmailProcessors.gs` a un proyecto de Google Apps Script vinculado a la cuenta de Gmail.

Script Properties requeridas:

- `WALLET_INGEST_URL`: `https://<dominio>/api/ingest/mail/transactions`
- `WALLET_INGEST_TOKEN`: el mismo valor que `INGEST_API_TOKEN` en Vercel
- `WALLET_TARGETS_JSON`: mapeo opcional de tarjetas/cuenta

```json
{
  "defaultAccountId": "uuid-opcional",
  "cards": {
    "4006": {
      "creditCardId": "uuid-card",
      "accountId": "uuid-account-opcional"
    },
    "INTERNACIONAL": { "creditCardId": "uuid-card" }
  }
}
```

Crear un trigger periódico para `processPendingEmails`. El script solo mueve un thread de
`Wallet/Pendiente` a `Wallet/Procesado` cuando todos sus mensajes reconocibles recibieron 2xx.
Los 5xx conservan el thread pendiente; las respuestas de duplicado también son 2xx.
