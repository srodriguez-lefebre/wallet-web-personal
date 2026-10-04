# Mail service (Google Apps Script)

Copiar `Code.gs` y `EmailProcessors.gs` a un proyecto de Google Apps Script vinculado a la cuenta de Gmail.

Script Properties requeridas:

- `WALLET_INGEST_URL`: `https://<dominio>/api/ingest/mail/transactions`
- `WALLET_INGEST_TOKEN`: el mismo valor que `INGEST_API_TOKEN` en Vercel
- `WALLET_TARGETS_JSON`: mapeos opcionales de tarjetas de crédito, débito y cuentas bancarias

```json
{
  "defaultAccountId": "uuid-opcional",
  "cards": {
    "1234": {
      "creditCardId": "uuid-card",
      "accountId": "uuid-account-opcional"
    },
    "INTERNACIONAL": { "creditCardId": "uuid-card" }
  },
  "debitCards": {
    "2468:UYU": { "accountId": "uuid-cuenta-pesos" },
    "2468:USD": { "accountId": "uuid-cuenta-dolares" }
  },
  "bankAccounts": {
    "1357:USD": { "accountId": "uuid-cuenta-origen" },
    "ITAU:9876540:USD": { "accountId": "uuid-cuenta-propia-destino" }
  }
}
```

Los números del ejemplo son ficticios. En `debitCards`, la referencia son los últimos cuatro
dígitos de la tarjeta de débito. En `bankAccounts`, la cuenta origen usa los últimos cuatro
dígitos informados por el banco. La cuenta destino requiere `BANCO:referenciaCompleta:moneda`,
por ejemplo `ITAU:9876540:USD` o `MIDINERO:9876540:UYU`: los números pueden repetirse entre bancos.
El nombre del banco se normaliza a mayúsculas, sin tildes ni el prefijo `Banco `.
Se prefiere `referencia:moneda` (UYU, USD, etc.); `referencia` sola es un fallback explícito para
origen/débito, y `BANCO:referencia` lo es para destino. Un destino sin banco explícito nunca se
usa para acreditar una cuenta propia.
Configurar una cuenta destino solamente si se verificó que pertenece al usuario. No deducir
propiedad por el banco ni asignar cuentas por defecto. Débito y transferencias consultan solo
sus propios mapas: nunca `cards` ni `defaultAccountId`. Estos últimos mantienen la compatibilidad
de crédito existente. Una referencia sin configurar se envía sin cuenta y queda para revisión.
Si el destino está confirmado como propio pero falta el origen, el mensaje queda pendiente
con un error de configuración hasta asignar esa cuenta: no se inventa un gasto entre cuentas propias.

Se reconocen avisos de consumo aprobado de crédito y débito y de transferencia realizada desde
el remitente exacto `comunicaciones@itau.com.uy`, también con nombre visible. Los asuntos se
comparan sin diferencias de mayúsculas ni tildes. El consumo de débito admite `Pesos` (UYU) y
`Dolares`/`Dólares` (USD); las transferencias admiten códigos de moneda y `$` para UYU. El formato
Automation Wallet conserva su reconocimiento por campos y el mapeo de crédito por alias.
Las transferencias incluyen referencias para el mapeo, pero la descripción del movimiento
solo muestra los últimos cuatro dígitos de destino. La API enmascara los metadatos persistidos.

Crear un trigger periódico para `processPendingEmails`. Cada mensaje ingresado con respuesta
2xx o sin formato soportado se marca leído. Los mensajes no soportados, incluidas devoluciones
y pagos de tarjetas, se completan sin crear movimientos: esos eventos todavía no se importan.
Un aviso financiero reconocido pero incompleto, un importe mal formado (agrupaciones incorrectas
o más de dos decimales), una excepción o una respuesta HTTP fallida
conserva el thread pendiente y no marca leído ese mensaje. El script solo mueve el thread de
`Wallet/Pendiente` a `Wallet/Procesado` cuando todos sus mensajes terminan correctamente.
Reintentar vuelve a enviar consumos anteriores con la misma clave `gmail:<fuente>:<messageId>`;
la API debe devolver duplicados como 2xx y no crear nuevos movimientos.

La búsqueda incluye todos los threads pendientes, sin límite de antigüedad ni exclusión de
`Wallet/Procesado`. Esto permite procesar mensajes nuevos de un thread que conserva esa etiqueta.
Cada ejecución atiende hasta 100 threads; posteriores ejecuciones continúan con los restantes.

Para publicar estos cambios, primero habilitar en la API `paymentType: debit | transfer` y
`destinationAccountId`, después actualizar el script y configurar únicamente mapeos verificados.
Una transferencia entre dos cuentas propias mapeadas se registra atómicamente por la API;
sin ambas cuentas propias confirmadas se registra como salida para revisión. Los avisos de
débito nunca generan consumos de tarjeta de crédito.

La simulación local ejecuta los archivos `.gs` reales y conserva el estado `isRead` por mensaje.
Verificar sin Gmail ni despliegues remotos con:

```powershell
npm exec vitest run scripts/sandbox/mail.test.ts
```

Cada ejecución registra la cantidad de threads encontrados, los mensajes reconocidos o
ignorados, el estado HTTP de la wallet y el resultado final de cada thread. Los logs nunca
incluyen `WALLET_INGEST_TOKEN`.
