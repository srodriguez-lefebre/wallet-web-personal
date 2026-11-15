# Paquete 4 · checkpoint de transporte

Plan: `docs/refactor-2026-11-14/PACKAGE4-PLAN.md` (local, ignorado).
Worktree: `/home/santi/proyectos/wallet-web-personal-package4`.
Rama: `refactor/04-entity-cache-views`. Este archivo registra un avance parcial;
Query, la caché por entidad y la separación completa de vistas siguen pendientes.

## Base publicada y presupuesto

- PR #9: main `f1cd16f97085ca4e201037c87fffec300afa5d24`.
- PR #10: main `098cb9d6e7f34b31d2378451d88a5b791786aaf2`.
- PR #11: https://github.com/srodriguez-lefebre/wallet-web-personal/pull/11,
  main `670164637a44b60a641c76a563bf5e186343b765`.
- Se usaron 3 de los 5 PRs autorizados. Todavía no existe PR del paquete 4.
- La migración 0022 ya está aplicada: journal anterior intacto, una sola fila
  añadida, sin migraciones pendientes. No repetirla ni reproducir las 0015–0020.
- Main se integró mediante merge normal en `b43b15219fc9c20c1236ee05284ce9df68f1f6e6`,
  sin reescribir `300db452`, `708309dc` ni historia publicada. Ese checkpoint ya está
  en GitHub y su preview está READY: `dpl_4oPMx7rD2M93ynsgNWzm6DQLdNxn`.

El bloqueo de publicación por 0022 está resuelto. Se pueden subir commits compatibles
validados a la rama de trabajo; conservar el flujo normal de PR, CI y merge.
No se permiten force push, saltos de CI ni cambios de secretos o permisos.

## Task 1 · cliente derivado del contrato, completa

Commit `300db45211870f239a1bd010d9dab66df310f3ea` preserva schemas runtime y OpenAPI,
y conserva la relación operationId → respuesta. El cliente tiene métodos tipados,
params/query/body, AbortSignal, errores no JSON legibles, callback 401 y un único
retry GET transitorio. Las mutaciones no se reintentan; unlock no envía la sesión
ni ingest puede reutilizarla.

Revisión independiente: se corrigió el único hallazgo, body opcional cuando el
objeto era obligatorio. Tres aserciones TypeScript RED → GREEN lo protegen.
Check original: 100 archivos / 743 pruebas; sandbox: 10 / 104. La integración con
main pasó check 100 / 749 en `/tmp/wallet-package4-main-integration-check.log`.

## Task 2a · consumidores del transporte, completa

WalletProvider (57 llamadas), Settings y AuthProvider usan los métodos del
contrato. Se retiraron `wallet-api.ts`, `auth-service.ts` y el evento global de 401. AuthProvider comparte una instancia estable y actualiza la sesión en memoria
y en el getter a la vez. Un 401 identifica el token usado por la llamada: una
respuesta tardía de A no puede cerrar una sesión B posterior, incluso entre tabs.

El tipo WalletBackup deriva del schema y conserva metadata nullable. El snapshot
para exportación se encola sin publicarlo en el dataset activo. Restore admite
backups y datasets; los chequeos de salud mantienen las referencias archivadas.
WalletSync todavía recarga el snapshot completo después de mutaciones.

Evidencia RED → GREEN:

- Auth client faltante: 4 fallos; identidad del token en 401: 1 fallo / 16 pass.
- Retiro del evento global: 1 fallo / 4 pass.
- Consumidores todavía usando el transporte anterior: 18 fallos / 4 pass.
- Regresión enfocada final de auth, provider, Settings y plantillas: 6 / 55 pass.
- HTTP real contra PGlite y migraciones: 1 / 1 pass. Comprueba unlock sintético,
  crear/editar/releer record, pagar deuda y reintentar sin duplicarla, tarjeta,
  backup, restore y reload. El servidor y la DB se cierran.

Validación final del código: `WALLET_TEST_WORKERS=1 npm run check`, exit 0,
102 archivos / 756 pruebas, formato, lint, build y OpenAPI verdes.
Log: `/tmp/wallet-package4-transport-final-check.log`.
`WALLET_TEST_WORKERS=1 npm run sandbox:check`, exit 0, 11 / 105.
Log: `/tmp/wallet-package4-transport-sandbox.log`.
Un callback de cierre del nuevo fixture HTTP tuvo un error TypeScript; se corrigió
antes de la validación final. No se omite ningún fallo del check anterior.

## Rulings registrados

- Los helpers cloud de skills no están en el filesystem: se usa este ledger y Git.
  Coste: retomar por commits y logs locales en lugar de scripts del workspace.
- La herramienta de worktrees devolvió “Cloud worktrees are unavailable”: se usó
  Git en un directorio hermano del mismo repo. No se copiaron envs ni metadata.
  Coste: verificar el cwd explícito antes de cada cambio.
- Se conserva la API snapshot para pestañas viejas hasta migrar todos los consumers.
  Coste: el ahorro de red de la caché por entidad todavía no está implementado.
- Backup tiene tipo inferido propio; no se fuerza un cast a WalletDataset ni se
  normalizan campos perdiendo metadata. Coste: los consumidores deben distinguirlos.
- Excepción puntual de `react-hooks/refs` en la construcción del cliente: el factory
  guarda callbacks y no lee la ref durante render. No se deshabilita la regla en
  configuración. Coste: mantener ese contrato de construcción pura en el futuro.

## Producción y siguiente paso

PR #11: CI head `43611856122` y main `43612282124`, ambos success. Producción READY
`dpl_ANvFnKmCHVtdQYFvHWTDg4ynDyNY`, alias `wallet-web-personal.vercel.app` sobre main
`6701646`. Después de la confirmación explícita de Santiago, smoke GET sin sesión:
portada 200; health y records/:id 401 JSON con no-store. El deployment concreto
responde 302 por protección; no hubo bypass ni pruebas con sesión real.

Continuar Task 2b: TanStack Query y queries reference/records/analytics/cards,
bootstrap que siembra cachés e invalidación selectiva. Mantener paridad de balances,
búsqueda, reportes y exportación antes de retirar historial del snapshot.
Después migrar Records/Cards y el kit de formularios. Hay borradores mecánicos no
aplicados ni validados en `/tmp/wallet-extract-record-components.mjs`,
`/tmp/wallet-extract-card-form.mjs` y `/tmp/wallet-card-forms-test.txt`; inspeccionarlos
antes de usarlos. No hay cambios de esas pantallas en el árbol pendiente.

Una revisión de todo el paquete y CI del SHA exacto son obligatorias antes del único
PR 4. No activar revocación, crear secretos, ejecutar drop legacy o reparar huérfanos.
Apps Script activo permanece intacto; su actualización se coordina desde el editor
Google de Chrome cuando el bundle compatible y sus fixtures estén probados.
Los commits nuevos deben tener títulos descriptivos y ningún Co-authored-by.

## Task 2b · referencia y base de Query en curso

Ruling: se agregan `wallet.reference` y `wallet.bootstrapReference` en vez de
cambiar el payload de rutas que usan pestañas anteriores. Coste: mantener las
lecturas legacy durante la transición. GET de referencia ejecuta un batch
REPEATABLE READ / READ ONLY y devuelve diccionarios y metadata de fechas/revisión,
sin records ni movimientos/pagos/allocations/ledger. El bootstrap nuevo conserva
la primera página completa. Sin nuevas columnas o migraciones.

Tests de repositorio y HTTP: RED por función/operación inexistente, luego GREEN
3 archivos / 7 pruebas, incluyendo contratos legacy. Un DISTINCT agregado falló
porque Drizzle generaba parámetros distintos para la misma zona horaria; se
proyecta la fecha local una vez en CTE. GREEN 2/2 y HTTP posterior verdes.
React Query 5 y MSW 2.11.6 instalados con npm/lockfile. Se fijó MSW compatible con
Node 22.22.1 de la HP; la última versión traía transitorios que exigían otro patch
de Node. No se actualizó el host ni se aplicó audit fix.

Base Query preparada (todavía sin cambiar App/WalletProvider): opciones tipadas,
primera página sembrada, retry GET sólo del transporte, tabla exhaustiva de
mutaciones por contrato. MSW: RED módulos faltantes → GREEN 4/4 (bootstrap
concurrente único, sin segunda lectura de página, invalidación selectiva de
settings/records y bootstrap cancelado sin recrear caché). Pendiente integración
React y datos agregados antes de retirar el historial del cliente.

La validación completa inicial pasó 104 archivos / 763 tests y falló después en
TypeScript: el mapper histórico Goal marcaba defaults como opcionales. Se valida
la referencia contra su schema para conservar defaults e inferencia; fixture con
goal real local comprueba autoCaptureEnabled/tagIds. Build y target posterior
3 archivos / 8 pruebas verdes. No se oculta el fallo anterior. Nueva validación
completa antes del commit: /tmp/wallet-package4-query-foundation-final-check.log.

Checkpoint de base Query validado: check completo exit 0, 104 archivos / 763
pruebas, formato/lint/build/OpenAPI verdes. Log:
`/tmp/wallet-package4-query-foundation-check3.log`. Se mantuvo un worker.
App/WalletProvider todavía no consumen estas nuevas primitivas; no afirmar que
se retiró WalletSync o que ya no se descarga historial. Siguiente: agregados SQL
para balances y metas (fixture diseñado en /tmp/wallet-aggregates-test.txt), luego
lecturas de presentación/agenda y consumidores. Preservar el crédito de reembolso
FIFO, reservas históricas y FX congelado; no usar páginas parciales para totales.

## Task 2b · agregados SQL de cuentas y metas en curso

Nuevas lecturas `analytics.accountBalances` y `analytics.goalProgress`, sin cambios
de esquema. Cuentas: SQL numeric, transferencias congeladas, crédito FIFO de
reembolsos, pagos, reservas al corte local y FX actual explícito. Metas: porciones
asignadas, FX congelado de cuenta/primary, cotizaciones históricas y puentes; las
conversiones faltantes salen null y no como cero. Ningún historial sale por HTTP.
Se extendió exchangeRateSql para aceptar columnas/fechas SQL conservando su política.

Regresiones sintéticas comparan las fórmulas anteriores contra SQL, incluyendo un
corte de 25 horas en America/New_York. DTOs atravesaron el router real. Rounding:
el fixture de una reserva bancaria 2.01 liberada a la mitad mostró una diferencia
real de 0.01 (JS 1.00 frente a numeric 1.01), 2 fallos / 1 pass. Helper nuevo con
BigInt sobre centavos persistidos: RED función inexistente, luego GREEN; también
conserva el último centavo en tercios. Ruling: usar redondeo decimal exacto coherente
con PostgreSQL y corregir la lectura JS, en vez de reproducir un error binario.
Coste: un saldo derivado en ese borde puede corregirse un centavo; no cambia
registros, asignaciones ni importes persistidos. Compartido y SQL ahora coinciden.

Target con money/FX/SQL/HTTP: 4 archivos / 11 pruebas verdes. Target con DST:
2 / 7 verdes. Lint limpio y build previo verde; código final se valida completo
antes del siguiente commit. Los consumidores de UI todavía usan WalletSync.

Validación completa de estos agregados: 105 archivos / 769 pruebas, formato,
lint, build y OpenAPI verdes. Log: `/tmp/wallet-package4-aggregates-check.log`.
Sin nuevas migraciones ni cambios en producción. La integración de UI continúa.

Commit `a8420ca3c05d658d55269983f35b1cb851cec0d5` subido y confirmado en GitHub.
Preview READY `dpl_B3j1MUQGdrS9hJAbqupAQZX11KgQ`, sin migraciones ni activaciones.

## Task 2b · reportes y tendencias en curso

`analytics.details` produce series mensuales, comparación diaria y por gasto,
totales anterior/mes actual, promedio para runway y comercios agrupados. Los
periodos de calendario se comparten con `analytics.balanceTrend`, que reutiliza
la aritmética de saldos y cortes locales en una sola lectura HTTP a la DB.
No se entrega historial por estas rutas. App/WalletSync todavía no los consumen.

Fixtures contra las fórmulas anteriores: RED por módulo faltante, luego 4/5;
el fallo restante reprodujo un presupuesto EUR sin cotización por puente (null
frente a 3.9625). Corregido el fallback histórico; también se evita usar el importe
de cuenta si falta la conversión congelada a primary. GREEN reportes 7/7,
incluyendo scope vacío, meses cortos, cuenta explícita y preferencias de ocultas.
Saldos/gráficos: 2 archivos / 12 pruebas verdes. Router HTTP de agregados verde.
Primer check completo se detuvo en import/order; corregido antes de repetirlo.

QA solicitada: HTTP real sintético con Query, cuenta 1000 y dos gastos 20+10
asignados a una meta. Página visible de tamaño 1 excluye el gasto anterior:
saldo/progreso 970/30; editar 10→30 actualiza caches activas a 950/50; una caché
nueva recarga los mismos resultados; deshacer vuelve a 970/30 y se comprueba
también tras refetch de la caché recargada. GREEN sandbox API 4/4 en
`/tmp/wallet-package4-paged-goal-qa.log`. Esto no prueba todavía la integración de
las pantallas con Query: repetir el recorrido tras migrar los consumidores.
No se confirmó ni se presupone un bug de exclusión de metas.

Para bloque 5 conservar casos sintéticos independientes: reintento del mismo
aviso sin duplicación; dos sueldos iguales en fechas distintas separados;
prefijo genérico de procesador y cuenta sin mapear en Needs review. Sin datos reales.

Check completo final exit 0: 106 archivos / 778 pruebas, formato, lint, build y
OpenAPI verdes. Log: `/tmp/wallet-package4-reports-check2.log`. El bloque agrega
lecturas compatibles y no requiere migraciones. Próximo: sesión de Query React,
restantes lecturas de Cards/metadata y migración de consumidores/vistas.

Commit reportes `93361af8cea63c57fdb5827ea347b06c3ed3cf60` confirmado en GitHub.

## Task 2b · ciclo de sesión React preparado

WalletQueryProvider posee una caché aislada por sesión, bootstrap compartido que
siembra referencia/página y limpieza al desmontar por bloqueo/cambio de sesión.
La limpieza diferida a microtask reconoce el replay de StrictMode sin duplicar
el POST, aborta respuestas tardías y borra el cache obsoleto de localStorage.
Todavía no se conecta en App: hacerlo junto con la migración de consumidores,
para evitar dos bootstraps y conservar paridad de Cards/notificaciones.

Testing Library/MSW: RED por proveedor inexistente; GREEN 8/8 con pruebas previas
de Query. Caso nuevo reprodujo la carrera de un GET inicial sin datos: al guardar
settings podía conservar `system` en vez de `dark`. RED 1 fallo / 4 pass.
Se cancelan lecturas afectadas antes de mutar, y al terminar se invalidan para
leer el estado canónico. GREEN final 3 archivos / 13 tests, incluyendo QA HTTP
de gasto/meta/saldo y undo. Log `/tmp/wallet-package4-query-session-race-green.log`.
TypeScript exit 0 (`query-session-types2.log`), imports corregidos por ESLint sin
desactivar reglas. No cambia App, sesiones productivas, DB ni Apps Script.

Commit `9d0d3a6fbef72c2fdab3e79d2036cb5b4c17fa0e` confirmado en GitHub;
preview READY `dpl_5R4dQv3b8UiWLFderLmEELawkKc6`.

## Task 3 · extracción inicial de vistas y estado UI

Records se movió a `src/features/records/RecordsView.tsx`; CategoryFilterSelect,
ImportHistory y ReviewRecordActions ahora son componentes wallet compartidos.
Opciones de categoría y draft de Cards están en lib; el formulario de Cards se
extrajo a `src/features/cards/CardFormDialog.tsx` sin cambiar el submit.
WalletUIProvider prepara un reducer sólo de selección, filtros, solicitud de
formulario y contexto de retorno de revisión, separado en estado/acciones.
Todavía no reemplaza WalletProvider: sus consumidores actuales siguen intactos.

Regresiones previas de Cards: 4/4 después de ajustar un selector al control de
límite actual (su label contiene dos controles y no nombra el input; corregir con
el kit). Post-extracción: 7 archivos / 69 tests verdes en
`/tmp/wallet-package4-view-extraction-green.log`, incluyendo cuatro casos UI y
cuatro de formularios Cards (crear, editar, fallo/reintento, doble submit ocupado).
Lint limpio (`view-extraction-lint.log`). TypeScript directo exit 0, registrado en
`/tmp/wallet-package4-view-types-direct.status`; dos llamadas anteriores quedaron
sin cierre visible y no se usaron como prueba de éxito. No se interrumpió proceso.
Pendientes: kit, RecordDraft/reducer y separación de filtros/lista/formulario,
lecturas Cards/metadata, integración Query y retiro definitivo de WalletSync.

Extracción subida en `ea36dd7531fd5463bb77a6ce70467a9fb8c81db8`, confirmada en GitHub.

## Task 3 · kit de formulario, primer consumidor

Kit en `src/components/ui/form`: Field/Label, Input/Textarea, Select Radix,
MoneyInput con conversión opcional, CurrencySelect desde schema, Date/DateTime,
AccountSelect (alternativas activas/visibles y valor histórico legible), CategoryField,
ColorInput, SegmentedControl accesible, FormDialog y ConfirmDialog. Cards usa el
kit y Limit tiene label propio; se conserva submit y retención de draft ante error.
CategoryPicker admite id para el label. Fecha/hora local está centralizada en
date-input; Records conserva el timestamp exacto si no se editó y su fallback de
fecha vacía. Valores de calendario imposibles se rechazan en el helper.

RED kit inexistente → GREEN 4/4. Teclado Radix/moneda/pestañas y regresiones de
Records: 5 archivos / 39 verdes. Cards/agenda/kit: 3 / 18. Fecha/hora RED función
faltante → GREEN 3/3. Primer check se detuvo en formato de imports largos de cuatro
tests movidos; se corrigieron y se repitió el check entero.
Check final exit 0: 110 archivos / 798 pruebas, lint/formato/build/OpenAPI verdes.
Log `/tmp/wallet-package4-form-kit-check2.log`, estado explícito en `.status`.
La app sigue usando WalletSync; aún no afirmar caché por entidad completa ni
separación final de Records, que conserva lógica de draft/formulario y lista.

## Task 3 · RecordDraft integrado

Tras reconexión se preservaron los dos archivos sin commit y se verificó main
`6701646`, rama remota `a61b0d9`, sin PR 4 existente. Las seis pruebas pendientes
habían fallado por un id faltante en una cotización del fixture; corregido el
fixture, pasaron 6/6 y TypeScript. Se agregaron plantillas/ventanas automáticas
de metas y un hook de reducer con setters estables y actualizaciones funcionales.

Records usa ese único draft para reset, edición, duplicación y plantillas. Los
cuatro modos de submit están en funciones puras: cancelación sólo de status,
metadata con FX sin resolver, metadata de reembolso y edición/creación normal.
Se preservan el timestamp exacto y FX congelado cuando no se editaron, y el
escalado bancario usa la base original incluso al cambiar varias veces el importe.
Las ventanas automáticas se mantienen como antes; no se dedujo un bug de
persistencia a partir de que el pedido global inicia sin asociaciones explícitas.
Los avisos de plantilla ahora están en inglés y no se guardan como notas.

La primera integración detectó un helper de fecha aún usado por un placeholder:
se corrigió antes de repetir. Target final: 6 archivos / 60 tests verdes,
`/tmp/wallet-package4-record-draft-integrated3.log`. El check completo terminó
exit 0: 112 archivos / 807 pruebas, formato/lint/build/OpenAPI verdes, en
`/tmp/wallet-package4-record-draft-check.log`, con estado en `.status`.
Pendiente separar diálogo/filtros/lista y conectar los consumidores de Query;
WalletSync sigue activo. No se modificaron DB, producción ni Apps Script.

## Task 3 · presentación de Records separada

La extracción preservada se retomó sobre `5c875bb`, confirmado remoto, con main
`6701646` y sin PR 4. RecordsView queda en 63 líneas y compone diálogo, filtros,
banner de revisión y lista. La lógica de formulario y presentación se conserva
en hooks específicos. RecordList → RecordDayGroup → RecordRow usa índices de
cuentas, categorías, tarjetas y tags, y agrupa sólo cuando cambian los records.
La acción principal de fila es un botón nativo; borrar es un control hermano.
Testing Library comprueba que borrar no abre el registro ni hay controles anidados.
Los estilos de inputs y notas se toman del kit en vez de declarar copias locales.

Target: 7 archivos / 61 pruebas verdes en `record-row-target2.log`, repetidas
después de resolver la propiedad de refs en `record-owned-refs-target2.log`.
Lint detectó refs mutadas desde props. Se trasladaron los callbacks completos a
los hooks propietarios, manteniendo los cuerpos originales y sin omitir reglas.
El primer traslado dejó un error de sintaxis, detectado y corregido antes de
repetir las 61 pruebas. Se quitó también un import sobrante. Validación completa
actual en `/tmp/wallet-package4-record-presentation-check2.log`, estado `.status`.
Pendiente: terminar consumidores de Query/lecturas Cards/metadata y retirar
WalletSync; completar la aplicación del kit y las otras vistas antes del PR 4.

Validación final de presentación: exit 0, 113 archivos / 808 pruebas y
formato/lint/build/OpenAPI verdes. Log
`/tmp/wallet-package4-record-presentation-check2.log` y `.status`. No quedaron
excepciones nuevas de lint. Próximo bloque independiente: lecturas agregadas de
agenda/uso de tarjetas y ledger por tarjeta, y metadata suficiente de referencia
para conectar Query sin convertir una página parcial en saldos o totales.

Commit de presentación `398010fdc634316aea86dd0a8aebc7b6f3fc2146` confirmado en GitHub.

## Task 2b · lecturas Cards preparadas

Rutas aditivas cards.agenda, cards.categoryUsage y cards.ledger, sin migraciones.
Agenda y uso por categoría se agregan en SQL, conservando reembolsos FIFO,
conversiones congeladas, compras legacy no duplicadas y categorías descendientes.
Agenda ignora pagos futuros, calcula días con la zona horaria del viewer, incluye
tarjetas archivadas y no confía en flags de estado desactualizados. Ledger carga
sólo una tarjeta en un batch REPEATABLE READ / READ ONLY; no envía records de Wallet
y sólo incluye asignaciones de pagos activos. Todos los handlers comparten ctx.db.

RED por módulo faltante → GREEN repositorio 4/4 comparando con las fórmulas
anteriores. HTTP real sintético y MSW/Query: 3 archivos / 15 pruebas verdes en
`/tmp/wallet-package4-card-read-http-query.log`. Comprueba que editar Cards refresca
el ledger activo y que editar settings no refetchea esa historia. TypeScript y
lint exit 0. OpenAPI regenerado. El check completo está en
`/tmp/wallet-package4-card-read-check.log` y `.status`.
Los consumidores de estas rutas aún deben integrarse en la app; WalletSync sigue
activo. No se modificaron datos reales, sesiones, secretos, producción o Apps Script.

El preview de `398010f` quedó READY `dpl_9xTnAsp7kuv3z3X4suaUVhPFw5Z7`.
Check final Cards exit 0: 114 archivos / 814 pruebas, formato/lint/build/OpenAPI
verdes, registrado en
`/tmp/wallet-package4-card-read-check.log` y `.status`. Continuar con metadata de
referencia y filtros completos de Records antes de conectar las pantallas a Query.

## Task 2b/3 · prerrequisitos de Records paginado

Se preservó `46fc5b9` y se verificó la terminal en server-miapto. Referencia ahora
incluye sólo las últimas correcciones por comercio normalizado y recuentos por
deuda, sin importes, moneda, notas o fechas de movimiento. La selección conserva
NFKC, savedAt y desempate por id de la lógica anterior; no depende de la página
visible. Una deuda sintética del test necesitó su categoría obligatoria: corregido
el fixture antes de confirmar RED por metadata inexistente, luego GREEN 3/3.

Filtros aditivos de Records: búsqueda wallet por categoría/parent, contraparte,
comercio, tags y nota con NFD/Mark; filtro de nota independiente y literal;
categorías descendientes con guard de ciclos; fechas por IANA opt-in, incluido
un día DST de 25 horas. Sin parámetros nuevos se conserva UTC, categoría exacta
y búsqueda anterior; se corrige el escape de backslash junto a %/\_. No requiere
extensiones ni migraciones. Cada página incluye el tipo de movimiento de tarjeta
vinculado, sin descargar todo el ledger. El tipo se valida con el schema común.
Las claves Query normalizan filtros vacíos para reutilizar la página sembrada;
renombrar categoría/tag invalida búsquedas activas. Settings sigue sin recargar
Records ni ledger. RED filtros/kind y Query → GREEN.

Se reprodujo con Testing Library que un editor abierto perdía el original cuando
el filtro/página lo retiraba del dataset. Ahora mantiene su snapshot de apertura:
fecha con segundos, FX congelado y restricciones de reembolso sobreviven a cambios
de página, y duplicar usa el snapshot. Duplicar conserva la política anterior de
pedir conversiones nuevas, en vez de copiar el importe bancario histórico.

Target de estas piezas: 6 archivos / 65 pruebas verdes en
`/tmp/wallet-package4-record-prerequisites-target.log` (estado `.status` 0).
Lint de los archivos modificados exit 0. TypeScript detectó kind como string del
schema SQL: se valida con Zod antes de exponerlo. El check anterior de metadata
se solapó por error con tests RED nuevos y terminó 5 fallos / 815 pass; no es
validación del árbol final. Repetir check completo sobre árbol estable antes de
commit. App todavía usa WalletSync: no afirmar integración Query terminada.

Validación completa del árbol estable: `WALLET_TEST_WORKERS=1 npm run check`,
exit 0, 115 archivos / 824 pruebas; formato, lint, build y OpenAPI verdes.
Log `/tmp/wallet-package4-record-prerequisites-check.log`, estado `.status` 0.
GitHub confirmó main `6701646`, rama `46fc5b9` y ningún PR 4 existente. Preview
anterior `46fc5b9` READY `dpl_Ewf2Bo6urKZYGmcsRRMw4tXoDtru`.
No se tocó producción, sesiones, migraciones o Apps Script.

Sandbox de estos prerrequisitos: exit 0, 11 archivos / 109 pruebas, en
`/tmp/wallet-package4-record-prerequisites-sandbox.log` y `.status`.
Antes del commit una comprobación adicional reprodujo una diferencia real de
casing: PostgreSQL devolvía οσ para ΟΣ, frente a ος del navegador. Se agregó
regresión SQL contra normalizeGlobalSearch y las reglas Unicode de casing por
defecto, incluida sigma contextual, I con punto, marcas, caracteres astrales y
todos los lowercase mappings del runtime. Sin cambiar la normalización del UI.

El servidor usa tablas Unicode estáticas, sin extensión ni configuración nueva;
ASCII usa el lower de la collation C incorporada. El resto conserva las reglas
Unicode del cliente sin depender del locale del cluster. El filtro de notas
conserva sus acentos. Regenerador reproducible:
`node scripts/generate-record-search-unicode.mjs`, seguido de Prettier para el
archivo generado; revisar cambios de versión y correr las regresiones antes de
publicarlo. Target final: 2 archivos / 22 pruebas verdes en
`/tmp/wallet-package4-unicode-final-target.log`, estado `.status` 0.
Esta corrección requiere repetir el check completo antes de commit/push.

Check final posterior a Unicode: exit 0, 116 archivos / 826 pruebas, formato,
lint, build y OpenAPI verdes en
`/tmp/wallet-package4-record-prerequisites-final-check.log` y `.status`.
Sandbox final exit 0: 11 archivos / 109 pruebas, en
`/tmp/wallet-package4-record-prerequisites-final-sandbox.log` y `.status`.
El árbol funcional quedó estable durante ambas validaciones. Continuar la
integración de Query conforme al plan local; no hay PR 4 todavía y siguen dos
PRs disponibles. App/WalletSync aún conservan el snapshot hasta esa integración.

## Task 2b · hooks de entidades y modelos de presentación preparados

El commit `6e2c43dfe330d9f7be6345f3b5b27c64524c40d8` se subió por fast-forward y se
confirmó con GitHub CLI, sin Co-authored-by. Preview READY
`dpl_GeeLc5VwUmPp253mUy3cjdQeJfMv` (`wallet-web-personal-b9i655z34.vercel.app`).

SessionQueries entrega un AbortSignal propio. Las mutaciones combinan ese signal
con el de la llamada y rechazan acciones ya canceladas antes de crear observers;
una acción tardía no escribe usando el token de otra sesión ni repuebla el cache
borrado. Si la sesión termina durante cancelQueries, no envía la escritura ni
refetchea con otro token. RED 2 fallos / 9 pass; se reprodujo además una entrada
nueva en mutationCache después del lock (RED 1/3), corregida antes de repetir.
Esto no activa revocación ni cambia secretos/configuración de autenticación.

analytics.details admite creditCardId opt-in para las tendencias de Cards. Ese
scope conserva actividad en cuentas ocultas como la fórmula anterior; accountId
explícito se combina con el filtro de tarjeta. El contrato anterior queda igual
si no se envía creditCardId. balanceTrend conserva su propio query sin ese campo.
RED 1/7 → GREEN. Sin migraciones, OpenAPI regenerado.

wallet-read-model deriva presentación desde referencia y agregados SQL: saldos,
metas, resumen, categorías, ahorro, runway, proyección y recomendaciones. No
recibe historial para calcular totales. Conversiones desconocidas conservan el
sentinel explícito NaN de la UI anterior; nunca se convierten a cero. Pruebas
comparan contra las fórmulas anteriores en tres scopes y mes/custom/all.

Hooks tipados en src/hooks/wallet-entities.ts: reference con selectors, Accounts,
Goals, Records infinito, Cards/ledger/agenda/summary, Analytics y balance trend.
Sus bindings de mutación se derivan de la tabla exhaustiva del contrato, sin
wrappers en el provider. Todavía no se conectan en App/las vistas activas.

Testing Library/MSW prueba gasto con impacto completo 970/30 → 950/50 → reload →
undo 970/30, aunque la página contiene sólo un movimiento y queda historial más
viejo. Bootstrap se conserva, no aparece wallet.get y no hay persistencia local.
Cards conserva archivadas y comparte summary entre lista/detalle; editar settings
no refetchea ledger/summary, editar límite sí. El primer fixture omitió un import:
corregido antes de la validación. La comparación inicial de lecturas contó un GET
abortado por el replay de StrictMode; diagnóstico verificó signals [true,false].
Se cuentan lecturas completadas para comprobar deduplicación, sin ocultar el
aborto de desarrollo ni cambiar las reglas de cancelación.

Target final: 5 archivos / 33 pruebas verdes,
`/tmp/wallet-package4-entity-readers-target.log` y `.status` 0. Lint de archivos
cambiados exit 0, `entity-readers-lint.log`. El typecheck previo detectó sólo un
parámetro no usado de Cards, ya corregido. Completar check/sandbox antes del
siguiente commit. Luego integrar consumidores y retirar WalletSync; no abrir el
PR 4 hasta cerrar el paquete, su revisión y los checks del SHA exacto.

Validación final de hooks/modelos: check completo exit 0, 117 archivos / 835
pruebas, formato/lint/build/OpenAPI verdes en
`/tmp/wallet-package4-entity-readers-check.log` y `.status`.
Sandbox exit 0, 11 archivos / 109 pruebas, en
`/tmp/wallet-package4-entity-readers-sandbox.log` y `.status`.
No se modificaron App, producción, migraciones, secretos o Apps Script.

## Pausa y traspaso a G14 · integración parcial de Query

Por instrucción de Santiago se pausa la implementación en la HP y se conserva
todo el árbol parcial en la misma rama, sin PR ni merge. Ver
[PACKAGE4-HANDOFF.md](PACKAGE4-HANDOFF.md) para alcance, copia del plan ignorado,
pruebas y pasos restantes. La última base validada es
`ac92edb7d6e33b48f5d44446754f70706c64a4cc`; el checkpoint posterior **no está
validado para merge**: última selección de vistas 73 aprobadas / 3 fallidas,
check completo y sandbox pendientes después de la activación parcial.
No se tocó main, producción, migraciones ni Apps Script. Bloque 5 y Apps Script
se harán también en la G14.

## Reanudación G14: paridad Query verificada

El worktree G14 continúa en la misma rama `refactor/04-entity-cache-views` desde
`fef5d44`; el checkout anterior quedó limpio e intacto. Se corrigieron las tres
pruebas pendientes preservando los invariantes: los balances/reportes esperan
sus agregados y el recuento de review usa metadata global, nunca una página.

La cobertura del provider anterior se trasladó a Query/UI. Incluye biblioteca
canónica, filtros/cola, patches parciales, archivo sin perder historia, lectura de
backup separada, bloqueo durante bootstrap/escritura, cancelación de respuestas
tardías, importación parcialmente fallida y error de refetch tras escritura
confirmada. Reintentar refresh sólo lee; no repite la escritura. Se retiraron
WalletSync y la caché persistida de referencia, sin consumidores activos.

La integración Testing Library/MSW usa el formulario real de Records: saldo/meta
970/30 → 950/50 → recarga → reversión 970/30, manteniendo historia fuera de la
página. Dos aserciones RED→GREEN exigieron enviar `expectedUpdatedAt` al editar;
un conflicto conserva el importe del draft y no reenvía la mutación.

En Windows, el fixture PostgreSQL se inicializa explícitamente con UTF-8 y omite
el sync de initdb porque es desechable. El diagnóstico confirmó WIN1252 y el
rechazo de normalización Unicode antes del cambio. Se normalizó también el glob
del fixture que comprueba exit 1. No cambian configuración ni datos productivos.

Verificación de esta etapa: `WALLET_TEST_WORKERS=1 npm run check`, exit 0,
119 archivos / 835 pruebas aprobadas / 1 omitida por plataforma; formato, lint,
tipos/build y OpenAPI verdes. `npm run sandbox:check`, exit 0: 11 archivos /
108 aprobadas / 1 omitida. El build mantiene un aviso de tamaño de chunk, sin
modificar su umbral. Logs locales G14: `../g14-integration-check3.log` y
`../g14-integration-sandbox.log` (no versionados).

El bloque 4 sigue parcial: falta cerrar formularios/resultados/draft lists,
confirmaciones accesibles, estado por entidad, revisión completa y smoke
full-stack sintético antes del único PR draft, CI, merge y verificación del alias.
No se inició el bloque 5 ni se modificaron Apps Script, secretos, permisos,
migraciones, datos reales o producción.

## G14: formularios y comprobación sintética

Se incorporaron resultados explícitos de acciones, drafts agrupados, reintento
por fila confirmada, navegación por entidad y defaults derivados de Query.
ConfirmDialog reemplaza window.confirm; los controles y monedas se comparten,
con contraste calculado para fondos de usuario. Ninguna vista supera 8 useState.
Las pruebas reprodujeron primero los fallos de navegación, defaults, doble envío,
filas repetidas, espera de escrituras y cancelación al desmontar.

`WALLET_TEST_WORKERS=1 npm run check` terminó con exit 0: 124 archivos,
857 aprobadas y 1 omitida por plataforma; formato, lint, tipos/build y OpenAPI
verdes (`../g14-final-check.log`). El aviso de chunk permanece visible.

QA desechable en localhost4175: 108 movimientos iniciales, incluidos gastos de
la meta fuera de la primera página. Chrome verificó creación 20, edición a 40,
recarga y reversión: saldo 9695 → 9675 → 9655 → 9695; meta 20,5% → 24,5% →
20,5%. HTTP confirmó paginación, pago de deuda idempotente, edición de tarjeta
y backup/restore sin alterar su saldo inicial. También se creó y pagó una deuda
desde UI y se comprobó cerrada tras recarga. Sólo datos sintéticos en memoria.

La revisión fresca del bloque completo está en curso. Sus hallazgos importantes
se resolverán antes del único PR; este avance validado todavía no autoriza el
merge. Quedan correcciones de revisión, check/sandbox finales, CI y Vercel.
