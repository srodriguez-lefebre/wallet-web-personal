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
confirmación. Los destinos archivados exigen elegir un reemplazo. Un guardado
fallido conserva el formulario para corregirlo o reintentar; los envíos pendientes
siguen protegidos frente a doble clic.

Needs review marca movimientos para verificar y conserva una etiqueta amarilla;
no excluye actividad financiera válida de saldos e informes. Cancelled sí la
excluye. Si falta una conversión, no se supone una relación 1:1: una cotización
primaria congelada de cero indica conversión pendiente y no suma al reporte
en esa moneda. Los importes conocidos de cuenta o tarjeta conservan su impacto.

El contrato vigente y generado está en [`contracts/openapi.yaml`](contracts/openapi.yaml).
`docs/` contiene roadmap y decisiones de producto; no describe por sí solo el
comportamiento desplegado.

## Mejoras de uso

- Inicio: vista principal sin bloques de avisos. La campanita junto a agregar
  reúne movimientos por revisar, deudas próximas/vencidas y estados de tarjeta
  cerrados con saldo pendiente, incluidas tarjetas archivadas.
- Cuentas: tarjetas de cuenta con sus importes disponibles y reservados;
  guardado de cambios con protección frente a doble clic y reintentos parciales.
- Tarjetas: apertura del estado exacto desde las notificaciones y advertencias
  al 80%/100% del límite.
- Movimientos: cola de revisión global, independiente del período y los filtros;
  un segundo clic, quitar su filtro de estado o elegir Status > All recupera el
  período y los filtros anteriores, incluso Needs review manual y después de
  navegar a otra vista. Clear all y Reset siguen
  limpiando los filtros de forma explícita. Duplicación como
  borrador nuevo, con fecha y cotizaciones actuales, sin copiar pagos de deuda.
- Análisis: Top merchants después de los cuatro bloques originales; diez
  comercios principales, frecuencia e importe medio según el período
  y las preferencias del reporte. Usa gastos WalletRecord con cotizaciones congeladas;
  muestra compras brutas, sin restar devoluciones ni volver a sumar consumos vinculados.
- Metas: importe restante y aportes orientativos diarios/semanales hasta la fecha
  objetivo; distingue metas vencidas, completas y conversiones pendientes. Edición
  y cierre desde el detalle: completar libera las reservas restantes en sus
  cuentas originales, conserva gastos e historial y detiene la captura automática.
  La operación es atómica y se puede cerrar antes de alcanzar el importe objetivo.
- Deudas: filtros por vencidas, próximos 7/30 días y avisos de vencimiento;
  una deuda sin importe definido conserva esa indicación.
- Inversiones: cartera por moneda y actualización persistida de valoración,
  incluido valor cero, preservando coste, moneda y fecha originales.
- Datos: diagnóstico de referencias/conversiones/revisión/categorías desde el
  respaldo completo; vista previa CSV por moneda y respaldos JSON fechados.
  El recibo indica cuándo se solicitó la descarga; comprobar el archivo descargado.
- Ajustes: caducidad automática de sesión y bloqueo manual.
  Bloquear elimina la sesión y la caché financiera del navegador.

Las mejoras se verifican en el sandbox local. Publicarlas y aplicar migraciones
en producción son pasos operativos separados.

Query mantiene las lecturas por entidad en memoria y dentro de la sesión actual.
No se guarda información financiera en localStorage. El arranque siembra la
referencia y la primera página de Records; saldos, metas, reportes y tarjetas
consumen agregados completos del servidor. Una página nunca representa todo el
historial. Bloquear aborta solicitudes y elimina las cachés; una respuesta de la
sesión anterior no puede repoblarlas.

El repositorio está organizado por agregado bajo `server/db/`; las operaciones
reciben la DB como primer argumento. El router crea como máximo un cliente por
request y rechaza cuerpos de unlock inválidos antes de consultar la base. El
límite de desbloqueo conserva cinco fallos por IP y agrega veinte globales por
ventana de quince minutos. Un desbloqueo válido no borra el contador global.
El perfil por defecto conserva el formato y las sesiones existentes. La baseline
aditiva `0022` prepara el esquema; la revocación y nuevos soft deletes siguen sin
activar según `REFACTOR-CHECKPOINT.md`.

## Funcionalidades nuevas

- Búsqueda global: botón de búsqueda o `Ctrl/Cmd+K` para encontrar cuentas,
  tarjetas, categorías, metas, deudas, inversiones y movimientos, o abrir acciones
  rápidas. Buscar movimientos limpia filtros anteriores y abre todo el historial.
  La búsqueda ignora mayúsculas y acentos; los movimientos se buscan en Records
  mediante filtros paginados del servidor.
- Plantillas: gestión en Configuración para guardar, editar, reutilizar y quitar
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

La tabla de plantillas requiere la migración `0018`. La regla de revisión
informativa y la conciliación de datos existentes requieren `0019` antes de
desplegar esta versión. La migración conserva cancelaciones y eliminaciones;
un saldo de deuda inconsistente se rechaza en vez de ocultarlo con un ajuste.
No se corrigen automáticamente cotizaciones antiguas ambiguas de correos: deben
verificarse manualmente. Tampoco se reconstruyen consumos de reservas antiguos
a partir de intenciones de movimientos en revisión: se conserva el libro de
reservas registrado y cualquier discrepancia histórica requiere revisión.
El estado real de las migraciones en producción debe comprobarse en el destino;
la comprobación de 2026-11-14 confirmó 0000–0022 aplicadas, con hashes CRLF
históricos verificados para 0015–0020. No repetirlas ni modificar el journal;
volver a ejecutar el preflight antes de cualquier ampliación futura.
El sandbox aplica las migraciones sólo a su base local al iniciar.

## Verificación del refactor

`npm run check` incluye formato versionado, lint con tipos, pruebas locales,
build y verificación del contrato generado. `npm run format` aplica Prettier;
`npm run format:check` sólo verifica. El índice usa LF.

Las pruebas usan hasta dos workers aislados. Un clúster `embedded-postgres`
por ejecución corre en un proceso hijo y contiene una plantilla migrada; cada archivo recibe una base
sintética independiente. PGlite sigue cubriendo el sandbox. No se conecta Neon
ni se leen credenciales productivas. Las pruebas de providers usan Testing
Library con jsdom; otras pruebas de vistas conservan temporalmente el renderer.

El alcance, compatibilidad y avance de los cinco paquetes están en
[REFACTOR-CHECKPOINT.md](REFACTOR-CHECKPOINT.md).

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

Para reproducir el QA con datos completamente sintéticos, sin respaldo personal:

```powershell
npx tsx scripts/sandbox/qa.ts
```

Abrir http://127.0.0.1:4175 y usar `wallet-local-test`. Este entorno aplica las
migraciones a PostgreSQL en memoria y usa la API real. No carga `.env`, no toca
`.local-wallet/` y bloquea conexiones externas. Incluye cuentas, categorías con
scroll, pendientes nuevos/anteriores, tarjetas con/sin estado pendiente y una
meta con gastos fuera de la primera página de Records. Sus
cambios sobreviven a una recarga del navegador y desaparecen al detenerlo:

```powershell
curl.exe -X POST http://127.0.0.1:4175/__qa/stop
```

El recorrido y los resultados del QA están en [QA-REVIEW.md](QA-REVIEW.md).

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
SESSION_TTL_SECONDS="3888000"
INGEST_API_TOKEN="otro-token-largo"
OPENAI_API_KEY="opcional-para-clasificar-comercios-desconocidos"
OPENAI_MODEL="gpt-5-nano"
```

El archivo `.env.local` esta ignorado por git.

Las nuevas sesiones duran 45 días por defecto (3.888.000 segundos). Las sesiones ya emitidas
conservan su vencimiento; volver a desbloquear la app emite un token con la nueva duración.

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

Las fechas de compras y pagos se presentan en la zona local del navegador,
igual que en Movimientos. Las fechas sin hora conservan su día de calendario.
Tarjetas separa el ciclo abierto de los estados cerrados con saldo pendiente;
cada vencimiento pendiente abre su estado exacto. El saldo total se identifica
como Outstanding y no se confunde con un vencimiento del ciclo abierto.

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

| Método | Ruta                    | Uso                                                              |
| ------ | ----------------------- | ---------------------------------------------------------------- |
| `POST` | `/api/auth/unlock`      | valida el token maestro y crea una sesión                        |
| `GET`  | `/api/health`           | smoke check autenticado                                          |
| `POST` | `/api/wallet/bootstrap` | genera recurrentes y carga el snapshot paginado                  |
| `GET`  | `/api/records`          | pagina records por cursor y filtros                              |
| `GET`  | `/api/wallet`           | snapshot completo para acciones explícitas y clientes anteriores |
| `GET`  | `/api/wallet/backup`    | respaldo consistente, incluyendo historial archivado             |
| `POST` | `/api/records/import`   | hasta 200 records por transacción                                |
| `POST` | `/api/wallet/restore`   | valida y restaura un respaldo completo atómicamente              |

`GET /api/records` acepta `limit`, `cursor`, `from` y `to`; devuelve
`{ items, nextCursor, hasMore }` dentro de `data`. El bootstrap genera las
recurrentes pendientes y devuelve una primera página. El frontend usa
bootstrap-reference y consultas por entidad; las mutaciones invalidan sólo las
lecturas afectadas. El snapshot completo se solicita explícitamente para CSV,
asistente o asociación histórica, sin publicarlo en la caché activa. `PATCH`
modifica únicamente los campos enviados;
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
cuando hay saldo inicial o actividad. Los registros `needs_review` conservan el
impacto financiero que permiten sus importes y conversiones conocidos; cancelar
excluye el movimiento sin inventar datos faltantes. Los pagos de deuda se
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

La clasificación usa reglas de comercio, reglas específicas y finalmente
OpenAI con las categorías actuales. Las reglas que apuntan a `Unknown expense`
también permiten consultar OpenAI. Uber, Cabify y Taxi corrigen el antiguo mapeo
a transporte público; Uber Eats mantiene la categoría de comida.

El fallback usa 2048 tokens de salida, razonamiento `low` para modelos GPT-5 y
un timeout de 30 segundos. Respuestas incompletas, refusals, errores HTTP y
categorías inválidas mantienen el gasto bajo revisión. Una categoría desconocida
también queda como `needs_review`; los importes válidos conservan su efecto en
saldos e informes.

Una clasificación válida de GPT se aprende en el catálogo persistente de
comercios y aliases. Las próximas entradas con ese descriptor usan la regla sin
consultar al modelo. Para comercios nuevos se conserva el descriptor completo
normalizado, sin recortarlo a términos generales; una regla existente con
categoría desconocida se actualiza conservando su identidad. No se aprenden
resultados desconocidos ni fallidos, y una corrección simultánea de una regla
existente prevalece sobre la inferencia pendiente. El aprendizaje se confirma en
la misma transacción que el movimiento: los reintentos, duplicados y fallos no
crean reglas adicionales. Las reglas aprendidas se incluyen en el respaldo JSON
junto con el catálogo y se recuperan al restaurarlo.
Los comercios nuevos aprendidos usan `matchMode: "exact"` para el descriptor
normalizado. Las reglas explícitas conservan `matchMode: "alias"` y prevalecen
sobre esa caché, incluso si se agregan más tarde. Los respaldos anteriores sin
ese campo mantienen el comportamiento por aliases, sin reinterpretar prioridades.
La migración aditiva `0020_merchant_match_mode` debe aplicarse al publicar esta
funcionalidad; no modifica registros financieros.

Los logs de Vercel incluyen el evento `mail_category_classification`, el ID de
ingesta, origen de la categoría y diagnóstico de la llamada: modelo, motivo,
HTTP, request ID, duración y tokens. No registran claves, cuerpos de error ni
descriptores financieros. El mismo diagnóstico queda en
`ingestion_events.sanitized_payload.classification` durante la retención de
metadatos existente de 90 días. Los fallos de categoría incluyen una nota visible
en el movimiento; los clasificados por el modelo indican `Categorized by OpenAI`.

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

## Refactor de contrato y baseline aditiva

El router se deriva del contrato y autentica antes de validar entradas privadas.
Cada request comparte una DB lazy y un requestId; el log JSON final contiene
operación, status y duración, sin cuerpo, query string ni parámetros SQL. Las
lecturas de wallet y estados de tarjeta no reparan datos. Abrir Tarjetas dispara
`POST /api/cards/refresh-statements`; las mutaciones sincronizan sus estados
dentro del batch financiero. `GET /api/cards/:id/summary` agrega una sola tarjeta
en SQL. Archivar tarjeta responde `{ archived: true }`; generar recurrentes usa
200 sin altas y 201 cuando crea instancias.

`GET /api/analytics/summary?from=YYYY-MM-DD&to=YYYY-MM-DD` devuelve totales,
categorías (incluidos ancestros), meses y presupuestos sin descargar el historial.
Acepta `accountId` y `timeZone` IANA (America/Montevideo por defecto). Las fechas
son inclusivas en esa zona. Respeta cuentas ocultas y las cotizaciones congeladas;
`needs_review` conserva su impacto y cancelados/eliminados se excluyen. Una
conversión pendiente aparece en `unresolvedRecords`; los presupuestos sin
conversión congelada disponible devuelven importes `null` y estado warning.
El snapshot completo conserva su contrato para clientes anteriores y acciones
explícitas; los reportes actuales consumen los agregados del servidor.

La migración `0022_repository_baseline` agrega índices, singleton de settings,
metadatos y columnas de archivo. No borra ni transforma importes y conserva
`goal_reservations`. Rechaza settings duplicados antes del DDL; no los reconcilia
automáticamente. La activación de los nuevos soft deletes, unicidad de tags
activos y FK de deudas se prepara para el siguiente paquete, cuando esta versión
ya sea un destino de rollback capaz de leer archivos. No aplicar FK sobre
referencias antiguas sin diagnóstico ni ejecutar drops sobre datos reales.

Antes de aplicar 0022, verificar destino, journal y recuperación sintética:

```bash
npm run db:preflight -- --env-file .env.local --expected-endpoint-sha256 <huella-verificada>
WALLET_TEST_WORKERS=1 npm run check
WALLET_TEST_WORKERS=1 npm run sandbox:check
```

El preflight sólo lee metadata y guards agregados; no aplica migraciones ni
imprime credenciales o filas financieras. La huella SHA-256 corresponde al
hostname normalizado sin `-pooler`, cotejado con un origen independiente del
archivo local. Detenerse si faltan migraciones anteriores, hay hashes desconocidos,
DDL parcial o más de una fila de settings. El journal histórico conserva hashes CRLF de
0015–0020: el preflight acepta sólo sus variantes byte a byte verificadas y fechas
originales, las informa en `legacyCrlfMigrations` y no modifica el journal ni
repite SQL. BOM, otros hashes, fechas alteradas o identidades duplicadas siguen
bloqueando la operación. No marcar migraciones como aplicadas
por suposición ni crear una copia de datos reales para ensayar. Migración antes
del deploy del código que lee sus columnas; rollback de código conservando las
columnas. Los tests restauran un backup sintético antiguo y comprueban rollback
de una migración rechazada. El restore financiero conserva la versión de sesión
y la marca de poda actuales; esos contadores no se importan desde un JSON.

`WALLET_TEST_WORKERS=1` limita Vitest a un worker en la HP; CI usa dos por defecto.

## Sesiones revocables preparadas, sin activar

Por defecto se conserva el formato y validación de sesión actuales.
`GET /api/auth/session` indica `revocable: false`; el botón para cerrar todas las
sesiones no aparece y `POST /api/auth/lock-all` devuelve 503 sin modificar versiones.
La poda de intentos se ejecuta en unlock con una marca persistente como máximo
una vez por hora y borra ventanas con más de 24 horas.

El perfil optativo requiere `SESSION_SECRET` independiente de ambos tokens
maestros, `LEGACY_SESSION_ACCEPT_UNTIL` con una fecha ISO explícita, y
`WALLET_REVOCABLE_SESSIONS=true`. No crear/rotar el secreto ni activar el perfil sin
la aprobación del dueño y sin confirmar 0022, despliegue y recuperación. No
aplicar parcialmente esta configuración. Preparar una ventana que cubra la
caducidad de las sesiones existentes (45 días por defecto) y probar la secuencia
con claves sintéticas. La fecha habilita transitoriamente firmas legacy de los
tokens maestros; después caduca. La activación sin esa ventana rechaza la
configuración en lugar de asumir un corte silencioso.

Los tokens nuevos llevan `ver` y no contienen `sub`; cada request privado
contrasta la versión persistida. El botón Lock all sessions incrementa la versión,
revoca también la pestaña que lo solicita y limpia su sesión local. Un restore
no reduce la versión. `API_TOKEN_PREVIOUS` mantiene el unlock al rotar el maestro;
con firma independiente las sesiones nuevas no dependen de esa rotación. No
rotar SESSION_SECRET como forma de probar revocación: se usa el endpoint explícito.

En la transición desactivada, una fecha legacy explícita permite introducir el
secreto independiente manteniendo las firmas anteriores hasta el plazo. No
desplegar estados intermedios sin haber comprobado esa compatibilidad. El perfil
está probado con dos sesiones sintéticas y queda desactivado hasta aprobación.
La caché de referencia legacy que requiere sub deja de persistirse con tokens
versionados; el cliente consulta la API normalmente y el paquete de caché por
entidad retira esa persistencia.

### Transporte del cliente durante el refactor

`src/services/api-client.ts` crea los métodos desde `shared/api-contract.ts`.
AuthProvider comparte una instancia estable: el callback de un 401 identifica
la sesión que hizo la llamada y no cierra una sesión posterior. GET reintenta
una vez ante fallos transitorios; las mutaciones no se reintentan. Los backups
conservan su tipo y metadata propios. Las lecturas explícitas de snapshot y
respaldo esperan las escrituras en curso y se abortan al bloquear la sesión.
Restore espera las escrituras anteriores y ordena las posteriores detrás de la
restauración; esa barrera y los reintentos de pagos sobreviven a la navegación.

El contrato también ofrece `GET /api/wallet/reference` y
`POST /api/wallet/bootstrap-reference`: diccionarios sin movimientos y una primera
página separada para sembrar la caché. Las rutas anteriores conservan su payload
para pestañas existentes. Las opciones de Query y las políticas de invalidación
están en `src/services/wallet-queries.ts` y `src/services/mutations.ts`. AppShell
muestra carga, refresco y errores de lectura, con reintento de lectura. Las
escrituras devuelven un resultado explícito; ante fallo los formularios conservan
sus drafts y los lotes reintentan sólo las filas sin confirmar. Los pagos de
deuda comparten claves de idempotencia por contenido dentro de la sesión.

`GET /api/analytics/accounts` devuelve saldos y reservas agregados, con corte local
opcional; `GET /api/analytics/goals` devuelve el progreso de las metas. Ambas
lecturas calculan importes en SQL sin enviar historial. Una conversión faltante
se devuelve como `null`, sin asumir una equivalencia entre monedas.

Las lecturas `GET /api/analytics/details` y `GET /api/analytics/balance-trend`
devuelven series de comparación por calendario y comercios agregados. Aceptan la
zona horaria del navegador y mantienen separadas las conversiones congeladas de
los gastos y las cotizaciones históricas usadas por presupuestos en otra moneda.

Cards dispone de `GET /api/cards/agenda` (deuda por resumen y urgencia en la zona
horaria indicada), `GET /api/cards/:id/category-usage` (uso agregado por categoría)
y `GET /api/cards/:id/ledger` (movimientos, resúmenes, pagos y asignaciones de una
tarjeta). Son lecturas sin actualización implícita de estados. El ledger usa un
batch de sólo lectura y no devuelve movimientos globales de Wallet. Las rutas
anteriores siguen disponibles para los consumidores existentes.

## Correo y dominio compartido (paquete 5)

Los parsers TypeScript de Itaú (crédito, débito, transferencia y pago) y Automation
Wallet comparten la normalización con Apps Script. `npm run mail:build` genera
`mail-service/normalization.gs`; `npm run mail:check` comprueba sus bytes en CI.
Copiar los tres archivos `.gs` versionados solamente después de verificar el backend
desplegado y guardar un respaldo del proyecto correcto. El sandbox ejecuta esos
archivos reales sin acceder a Gmail. No hacen falta cambios de triggers, scopes,
propiedades ni credenciales para esta actualización.

La migración aditiva `0023_ingestion_policy_state` agrega políticas de categoría y
estado operativo de proveedores. Las políticas usan `systemKey`; los aliases y las
correcciones se buscan en SQL. Se conservan los aliases únicos del catálogo manual y
aprendido: las políticas de fallback tienen su propia colección en el backup.
El backfill asigna claves sólo a categorías canónicas no ambiguas, sin cambiar sus
nombres, padres, asignaciones manuales ni movimientos. Renombrar una categoría
conserva la clasificación. Un procesador sin comercio identificable y una cuenta
bancaria sin mapear quedan en Needs review.

OpenAI dispone de 10 segundos por llamada y Frankfurter v2 de 4, incluida la lectura
de la respuesta. Tres fallos consecutivos abren un circuito persistente durante
cinco minutos; sólo una llamada prueba su recuperación. Una respuesta tardía no
puede cerrar un circuito más nuevo. Se prefieren las cotizaciones almacenadas;
una respuesta externa debe coincidir con el par solicitado, tener una fecha válida
no posterior a la operación y una tasa finita positiva. La disponibilidad de UYU y
ARS está documentada en el [catálogo de Frankfurter](https://frankfurter.dev/currencies/).
La función consolidada mantiene sus rewrites y tiene `maxDuration: 60`.
La poda de metadatos tiene una marca persistente y se ejecuta como máximo una vez
por hora. Los circuitos y esa marca sobreviven a la restauración financiera; no
contienen datos financieros ni se importan desde un JSON.

Antes de desplegar el código que lee 0023, cotejar la huella del endpoint con un
origen independiente, verificar el journal 0000–0022 y los hashes históricos
permitidos, y probar la migración y el restore con datos sintéticos. No usar
bootstrap ni copiar registros productivos para esta verificación. Aplicar el
DDL y su entrada de journal en una transacción. Recuperación: rollback del código
conservando las tablas, índices y claves agregadas; no ejecutar un down destructivo.
Una versión anterior puede tratar las nuevas claves como categorías protegidas
hasta volver al código actual. El checkpoint del paquete registra si la migración
real y el despliegue ya fueron verificados.

Los cálculos viven en `dates`, `money`, `balances`, `cards`, `debts`, `analytics`,
`categories`, `goals` y `budgets`; reciben un reloj explícito cuando lo necesitan.
`calculateAccountBalances(dataset, now, cutoff?)` comparte el cálculo corriente e
histórico, incluido el ledger de reservas. Los esquemas están separados por entidad
y `shared/types.ts` infiere sus tipos de Zod. Los patches conservan la semántica de
limpiar campos mediante `null`.

Los importadores se ejecutan con `tsx` mediante npm y usan `process.loadEnvFile`:

```powershell
npm run db:import-wallet-records -- ruta/al/archivo.csv
npm run db:import-merchant-rules -- ruta/al/catalogo.json
```

También admiten `WALLET_RECORDS_PATH`, `WALLET_MERCHANT_RULES_PATH` y un archivo de
entorno explícito en `WALLET_IMPORT_ENV_FILE`. El catálogo admite cualquier cantidad
positiva de reglas validadas y resuelve categorías por claves estables. No hay una
ruta personal predeterminada. Cada importación reemplaza sus colecciones en un único
batch con locks; una falla tardía revierte todo. El CSV se valida antes de escribir,
conserva salarios iguales en fechas distintas y exige una referencia UYU válida
para moneda extranjera. Las transferencias requieren el importador API con cuentas
origen y destino explícitas. Las referencias de otros módulos que impidan un reset
provocan rollback; no se borran para forzar la importación. Respaldar antes de una
importación solicitada expresamente; estos scripts no se ejecutan como parte del
despliegue ni de las pruebas contra producción.
