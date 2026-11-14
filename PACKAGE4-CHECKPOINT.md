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
