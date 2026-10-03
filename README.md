# Wallet Web Personal

Wallet web personal para controlar gastos, ingresos, cuentas, tarjetas de credito, goals, presupuestos y analiticas.

## Estado actual

La API persiste cuentas, records, categorías, settings, deudas y reglas
recurrentes, tarjetas y sus consumos/pagos, tags, goals y reservas, presupuestos,
inversiones y planes de cuotas. El cliente recarga el estado canónico después de
cada mutación; una falla de recarga se informa sin presentar datos viejos como
una operación completamente actualizada.

Las plantillas reutilizables de movimientos también se guardan en PostgreSQL,
se incluyen en el respaldo y se administran desde Configuración → Gestión de
plantillas. Guardar una
plantilla conserva importe, moneda, destinos, categoría, una etiqueta y notas.
Usarla abre un borrador en Movimientos con fecha y conversiones actuales; el movimiento requiere
confirmación. Los destinos archivados exigen elegir un reemplazo. Si una creación
financiera falla con resultado incierto, se bloquea el reintento desde ese borrador
y se exige recargar y revisar los movimientos.

El contrato vigente y generado está en [`contracts/openapi.yaml`](contracts/openapi.yaml).
`docs/` contiene roadmap y decisiones de producto; no describe por sí solo el
comportamiento desplegado.

## Mejoras de uso

- Inicio: avisos de revisión en todo el historial, deudas próximas/vencidas y
  agenda de estados de cuenta pendientes; actualización manual con hora comprobada.
- Cuentas: liquidez disponible y reservada por moneda, sin sumar monedas distintas;
  guardado de cambios con protección frente a doble clic y reintentos parciales.
- Tarjetas: estados pendientes ordenados por vencimiento, incluidas tarjetas
  archivadas; apertura del estado exacto y advertencias al 80%/100% del límite.
- Movimientos: cola de revisión independiente del período; duplicación como
  borrador nuevo, con fecha y cotizaciones actuales, sin copiar pagos de deuda.
- Análisis: diez comercios principales, frecuencia e importe medio según el período
  y las preferencias del reporte. Usa gastos WalletRecord con cotizaciones congeladas;
  muestra compras brutas, sin restar devoluciones ni volver a sumar consumos vinculados.
- Metas: importe restante y aportes orientativos diarios/semanales hasta la fecha
  objetivo; distingue metas vencidas, completas y conversiones pendientes.
- Deudas: filtros por vencidas, próximos 7/30 días y avisos de vencimiento;
  una deuda sin importe definido conserva esa indicación.
- Inversiones: cartera por moneda y actualización persistida de valoración,
  incluido valor cero, preservando coste, moneda y fecha originales.
- Datos: diagnóstico de referencias/conversiones/revisión/categorías desde el
  respaldo completo; vista previa CSV por moneda y respaldos JSON fechados.
  El recibo indica cuándo se solicitó la descarga; comprobar el archivo descargado.
- Ajustes: caducidad automática de sesión y bloqueo por inactividad opcional de
  5/15/30 minutos, desactivado por defecto y guardado sólo en este navegador.
  Bloquear elimina la sesión y la caché financiera del navegador.

Las mejoras se verifican en el sandbox local. Publicarlas y aplicar migraciones
en producción son pasos operativos separados.

## Funcionalidades nuevas

- Búsqueda global: botón de búsqueda o `Ctrl/Cmd+K` para encontrar cuentas,
  tarjetas, categorías, metas, deudas, inversiones y movimientos, o abrir acciones
  rápidas. Buscar movimientos limpia filtros anteriores y abre todo el historial.
  La búsqueda ignora mayúsculas y acentos; indica si el historial aún se está cargando.
- Plantillas: biblioteca en Movimientos para guardar, editar, reutilizar y quitar
  configuraciones sin modificar el historial financiero. Los nombres son únicos
  sin distinguir mayúsculas ni espacios exteriores y se admiten hasta 100 plantillas.
- Asistente de presupuestos: en Análisis propone límites mensuales a partir de
  tres meses completos anteriores, incluyendo meses sin gastos, con margen e
  importes editables. Los nuevos presupuestos se aplican todos los meses; el mes
  elegido sólo determina el período de cálculo y no puede ser futuro. Usa los
  gastos WalletRecord y sus cotizaciones congeladas, según las preferencias del
  reporte; excluye compras directas de Tarjetas sin WalletRecord. Agrupa
  subcategorías y bloquea categorías que se superponen con presupuestos activos.
  Guarda cada selección por separado; ante fallos muestra lo confirmado y
  concilia el estado actual antes de reintentar. El lote completo no es atómico.

La tabla de plantillas requiere la migración `0018` antes de desplegar esta versión.
El sandbox aplica las migraciones sólo a su base local al iniciar.

## Stack

- React + Vite + TypeScript
- Tailwind CSS + componentes estilo shadcn/ui
- Recharts
- Vercel Functions
- Neon/PostgreSQL
- Drizzle ORM + Drizzle Kit
- Zod
- Vitest

## Setup Local

Para pruebas aisladas con un respaldo personal, usar el sandbox:

```powershell
npm install
npm run sandbox:setup -- --backup "$env:USERPROFILE/Downloads/wallet-backup.json"
npm run sandbox
```

Abrir http://127.0.0.1:4173 y desbloquear con el código de prueba
`wallet-local-test`. El simulador de correo está en
http://127.0.0.1:4173/__sandbox. Permite crear avisos Itaú/Automation Wallet,
configurar destinos, ejecutar `processPendingEmails` y volver un thread a
pendiente para probar reintentos y duplicados. Ejecuta los archivos actuales de
`mail-service/`, no envía correos ni accede a Gmail real.

La API usa el router y repositorio reales, PostgreSQL embebido (PGlite), las
migraciones del proyecto y el driver Neon HTTP con transporte local. Los datos
persisten en `.local-wallet/`, ignorado por Git. No carga `.env` ni credenciales
de producción; bloquea conexiones externas de la API, incluida clasificación
OpenAI. Las conversiones requieren una cotización guardada o un importe convertido explícito.

```powershell
npm run sandbox:stop
npm run sandbox:setup -- --reset
npm run sandbox:check
```

El reset requiere detener el servidor y restaura la copia inicial del respaldo;
conserva la base anterior en `.local-wallet/db-before-reset-*`. Para reemplazar
el snapshot, agregar `--backup <ruta>` al reset. Nunca modifica el archivo
original de Descargas. Si ya existe una base, el setup no la reemplaza sin
`--reset`. Un lock impide abrir la misma base en dos procesos.
La restauración valida e importa una base provisional antes de reemplazar la
activa; si el snapshot falla, conserva la base, el buzón y el respaldo anteriores.
Después de un cierre forzado, verificar que el proceso esté detenido antes de
eliminar `.local-wallet/process.lock`; los locks viejos no se borran automáticamente.

Un snapshot reproduce únicamente los datos que exportó la wallet y nunca incluye
secretos. Un respaldo antiguo puede carecer de reglas privadas de comercios,
eventos de ingesta y filas archivadas; el respaldo completo actual conserva
reglas, claves de procesamiento e historial archivado. PGlite permite probar SQL, persistencia y rollback,
pero usa una sola conexión; las carreras entre varias conexiones deben validarse
posteriormente contra un PostgreSQL de pruebas independiente.

Para el entorno tradicional conectado a una base Neon:

```powershell
npm install
```

Crear `.env.local` con:

```txt
DATABASE_URL="postgresql://..."
API_TOKEN="token-largo"
SESSION_SECRET="secreto-independiente-para-firmar-sesiones"
SESSION_TTL_SECONDS="1296000"
INGEST_API_TOKEN="otro-token-largo"
OPENAI_API_KEY="opcional-para-clasificar-comercios-desconocidos"
OPENAI_MODEL="gpt-5-nano"
```

El archivo `.env.local` esta ignorado por git.

## Comandos

```powershell
npm run dev
npm run build
npm run lint
npm run test
npm run check
npm run api:spec
npm run api:spec:check
npm run benchmark:api
npm run db:generate
npm run db:migrate
npm run db:import-wallet-records
npm run db:import-merchant-rules
```

El unlock siempre valida contra `API_TOKEN`; no existe un bypass de desarrollo.
El token maestro se intercambia por una sesión firmada de duración limitada;
el navegador guarda esa sesión, no el token maestro. La ingesta usa un token
independiente y no acepta la sesión de usuario.

Para probar la app completa con endpoints reales en local, usar Vercel Dev:

```powershell
npx vercel dev --listen 3001
```

El CLI puede pedir login la primera vez. Una vez levantado, entrar a
`http://localhost:3001` y desbloquear con `API_TOKEN`.

## Tarjetas de credito

La vista `/cards` administra tarjetas con un unico limite y moneda de limite,
dias fijos de cierre y vencimiento. Sus consumos se registran sin afectar una
cuenta bancaria, conservan la moneda original y guardan la conversion usada para
consumir el limite. Cada consumo requiere categoria.

Los pagos pueden ser externos o descontarse de una cuenta. Un pago reduce la
deuda y el limite utilizado; cuando se elige una cuenta tambien reduce su saldo.
Superar el limite muestra una advertencia, pero no bloquea el movimiento.

Antes de usar esta funcionalidad contra una base existente, aplicar las migraciones
con `npm run db:migrate`. Las migraciones son aditivas y no convierten
automaticamente cuentas antiguas de tipo `credit_card`, porque no contienen el
limite, los ultimos cuatro digitos ni las fechas necesarias.

## Deploy

Para Vercel:

- Configurar `DATABASE_URL`.
- Configurar `API_TOKEN`.
- Configurar `SESSION_SECRET` con un valor distinto de `API_TOKEN`.
- Configurar `INGEST_API_TOKEN` si se usa la automatización de correo.
- Deployar el repo.

Neon Auth no es necesario para esta version. Neon se usa como PostgreSQL.

## API

Todas las respuestas usan `{ data, error }`. Salvo `POST /api/auth/unlock` y la
ingesta con token dedicado, las rutas requieren la sesión en
`Authorization: Bearer <token>`.

| Método | Ruta                    | Uso                                                  |
| ------ | ----------------------- | ---------------------------------------------------- |
| `POST` | `/api/auth/unlock`      | valida el token maestro y crea una sesión            |
| `GET`  | `/api/health`           | smoke check autenticado                              |
| `POST` | `/api/wallet/bootstrap` | genera recurrentes y carga el snapshot paginado      |
| `GET`  | `/api/records`          | pagina records por cursor y filtros                  |
| `GET`  | `/api/wallet`           | snapshot completo para sincronización y exportación  |
| `GET`  | `/api/wallet/backup`    | respaldo consistente, incluyendo historial archivado |
| `POST` | `/api/records/import`   | hasta 200 records por transacción                    |
| `POST` | `/api/wallet/restore`   | valida y restaura un respaldo completo atómicamente  |

`GET /api/records` acepta `limit`, `cursor`, `from` y `to`; devuelve
`{ items, nextCursor, hasMore }` dentro de `data`. El bootstrap genera las
recurrentes pendientes y devuelve una primera página. El frontend obtiene además
el snapshot completo para reportes/exportaciones e invalida lecturas anteriores
cuando hay una mutación. `PATCH` modifica únicamente los campos enviados;
los campos opcionales que admiten limpieza se envían como `null`.

En `/data`, CSV conserva la moneda y los importes/tasas congelados, admite
campos entrecomillados con saltos de línea y consulta el historial completo antes
de comprobar duplicados. Los archivos grandes se envían en lotes de hasta 200:
cada lote es atómico, pero el archivo completo no lo es. Ante un error se muestra
el número confirmado y se recarga antes de reintentar. Una respuesta perdida
puede requerir reconciliar el último lote.

La exportación JSON obtiene un snapshot consistente con las entidades archivadas,
sus vínculos, el historial de reservas, las reglas de comercios y las claves de
procesamiento de correos para conservar la protección contra reintentos. Los
respaldos antiguos conservan las reglas actuales cuando sus categorías pueden
remapearse sin ambigüedad; una incompatibilidad rechaza el reemplazo completo.
La restauración JSON valida el
archivo, muestra sus cantidades y exige confirmar el reemplazo de los datos.
Un respaldo de la wallet no incluye credenciales ni configuración externa.

Los pagos de deudas y tarjetas se aplican con transacciones e idempotencia:
un reintento con la misma clave no vuelve a descontar dinero. Los importes de la
cuenta, la moneda original y el importe recibido en una transferencia se guardan
por separado. Una cotización ausente exige revisión o entrada explícita; no se
supone equivalencia entre monedas. La moneda principal queda protegida cuando
existe historial financiero para evitar reinterpretar importes congelados.
La moneda de las cuentas y del límite de las tarjetas también queda protegida
cuando hay saldo inicial o actividad. Los registros `needs_review` no afectan
los saldos, las reservas ni los informes hasta validarse. Los pagos de deuda se
crean con la acción de pago; CSV no puede insertar nuevos pagos vinculados sin
conciliar la deuda. Para restaurar ese historial se usa el respaldo JSON completo.

Las pruebas de integración ejecutan las migraciones en bases temporales locales.
Las pruebas de concurrencia usan PostgreSQL con conexiones independientes mediante
`embedded-postgres`, sin conectarse a Neon ni leer credenciales de producción.

Vercel despliega una sola Serverless Function: `vercel.json` reescribe todas las
rutas `/api/*` al router consolidado de `api/index.ts`. La API es privada y
pre-1.0; frontend y backend se actualizan juntos y todavía no se garantiza
compatibilidad pública.

## Ingestion de correos

`POST /api/ingest/mail/transactions` recibe eventos normalizados del Apps Script
de `mail-service/` y se autentica exclusivamente con `INGEST_API_TOKEN`. El backend
resuelve comercios, categorias, moneda, destino, idempotencia y duplicados. Los
destinos desconocidos se guardan como `needs_review` sin inventar IDs ni impactos.

Después de migrar, cargar el catálogo de 254 reglas desde el checkout WSL de
`wallet-automation`:

```powershell
npm run db:import-merchant-rules
```

Se puede pasar una ruta JSON alternativa como argumento directo al script.

## Carga de datos reales

El importador usa `.env.local`, resetea las tablas principales de la wallet y carga
`wallet_records.csv` con una unica cuenta llamada `Banco`.

```powershell
npm run db:migrate
npm run db:import-wallet-records
```

El script crea categorias padre/hija con icono y color inferidos desde
`categories-from-wallet-records.md`, normaliza categorias con espacios sobrantes y
carga los records en Neon.
