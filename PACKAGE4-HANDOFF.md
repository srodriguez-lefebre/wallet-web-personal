# Traspaso del bloque 4 a la G14

Estado al pausar por instrucción de Santiago: **checkpoint parcial, no listo para PR ni merge**.
No seguir implementando en la HP. El bloque 5 y la actualización de Apps Script también
se harán en la G14, por separado; no se modificó el script activo.

## Rama y base

- Rama única: `refactor/04-entity-cache-views`.
- Última base con check completo y sandbox verdes:
  `ac92edb7d6e33b48f5d44446754f70706c64a4cc`.
- Main de referencia: `670164637a44b60a641c76a563bf5e186343b765` (PR #11).
- Este checkpoint conserva la activación parcial de Query en App y consumidores.
  No abrir otro PR para el checkpoint: quedan dos de los cinco PRs autorizados;
  el bloque 4 debe cerrar con un solo PR cuando cumpla sus verificaciones.
- No hay migraciones nuevas en estos cambios. Conservar las APIs legacy para
  pestañas anteriores y Apps Script; no activar revocación ni cambiar secretos.

## Trabajo preservado

- `App.tsx`: QueryProvider, gate de bootstrap, UIProvider y tema de referencia.
- `hooks/use-wallet.ts`, `services/wallet-actions.ts`: fachada de referencia y
  acciones derivadas del SDK, lecturas completas sólo por acción explícita.
- `wallet-provider.tsx`: barrel del provider UI; estado de queries en AppShell.
- Records: páginas por filtros, metadata global de revisión, paginación y estados
  de carga/error. El editor conserva el snapshot aunque salga de la página.
- Dashboard, Analytics, Accounts, Goals y sus detalles: integración parcial con
  agregados y hooks; Cards usa summary/agenda/ledger por tarjeta y refresh explícito.
- Debts usa conteos agregados; Imports obtiene historial sólo cuando se solicita.
- `src/test/legacy-wallet-view.ts` y mocks de vistas: adaptación parcial con las
  fórmulas anteriores como oráculos. No sustituye la integración real Query/MSW.

## Evidencia de pruebas

Estos resultados pertenecen a sus respectivos estados del árbol; no implican
que el checkpoint completo esté validado.

| Estado | Ejecución | Resultado |
| --- | --- | --- |
| Base ac92edb | `npm run check` | Exit 0; 117 archivos, 835 pruebas; formato/lint/build/OpenAPI verdes |
| Base ac92edb | `npm run sandbox:check` | Exit 0; 11 archivos, 109 pruebas |
| Integración parcial | App Query + wallet-actions + UIProvider | 3 archivos, 10 pruebas aprobadas; status 0 |
| Integración parcial posterior | Selección Query/pages/cards | 4 archivos, 12 pruebas aprobadas según salida de Vitest |
| Última selección de vistas | 9 archivos | 6 archivos aprobados, 3 fallidos; 73 pruebas aprobadas, 3 fallidas; status 1 |

Fallos pendientes de la última selección:

1. `src/views/accounts-view.test.tsx`: `incomplete history withholds account balances and displays its loading state`.
2. `src/views/analytics-view.test.tsx`: `merchant table withholds partial totals and shows a clear empty state for a complete period`.
3. `src/views/records-view.test.tsx`: `review count does not present partial loaded history as a complete total`.

Los dos primeros esperan textos anteriores de historial completo; el tercero
requiere distinguir metadata completa de una página parcial en el nuevo harness.
Revisar los invariantes antes de adaptar expectativas: no asumir que son sólo
textos ni borrar cobertura para pasar.

La última ejecución de TypeScript devolvió exit 2 antes de las últimas
organizaciones de imports y adaptación de mocks. **No se repitió TypeScript,
lint, check completo ni sandbox después de esas ediciones**. Se conservan posibles
errores de tipos/imports, particularmente en pruebas del provider anterior y el
nuevo helper de pruebas. No hubo smoke de producción ni pruebas con datos reales.

Logs locales de la HP (no versionados ni necesarios para clonar):

- `/tmp/wallet-package4-entity-readers-check.log` y `.status` (0).
- `/tmp/wallet-package4-entity-readers-sandbox.log` y `.status` (0).
- `/tmp/wallet-package4-app-activation-target2.log` y `.status` (0).
- `/tmp/wallet-package4-query-pages-target2.log` (4/12 aprobados).
- `/tmp/wallet-package4-view-parity-target.log` y `.status` (1).
- `/tmp/wallet-package4-consumers-types.log` (ejecución anterior a las últimas ediciones).

Última selección fallida reproducible:

```bash
WALLET_TEST_WORKERS=1 npx vitest run \
  src/views/records-view.test.tsx src/views/records-review-fx.test.tsx \
  src/views/records-money-edit.test.tsx src/views/card-agenda.test.tsx \
  src/views/card-forms.test.tsx src/views/dashboard-goals.test.tsx \
  src/views/analytics-view.test.tsx src/views/accounts-view.test.tsx \
  src/views/planning-views.test.tsx
```

## Siguiente trabajo en la G14

1. Verificar rama/SHA y árbol antes de editar. Mantener este checkpoint y la base
   ac92edb; completar tipos/lint y revisar los tres fallos sin perder invariantes.
2. Terminar wiring y regresiones reales de Records/Cards. Repetir el gasto que
   modifica saldo y avance de meta con historial fuera de página, recarga y undo
   usando formularios reales. La capa SQL/hooks ya lo prueba; falta cerrar vistas.
3. Migrar pruebas de WalletProvider/WalletSync a Query/UI antes de retirar módulos
   anteriores. Preservar bootstrap, cancelación/lock, ausencia de stale overwrite,
   backup separado y errores visibles. Query ya no usa WalletSync activamente,
   pero los archivos anteriores aún existen. Comprobar todos los consumidores.
4. Verificar mutación confirmada con fallo de refetch: mostrar error de consulta
   y datos obsoletos sin reintentar la escritura ni presentar la caché como fresca.
   La implementación parcial usa invalidación y estado global; falta su regresión.
5. Revisar navegación entre ids en CardDetail/GoalDetail para no conservar drafts
   de otra entidad. Conservar ciclos financieros UTC existentes; no introducir un
   cambio especulativo de fechas sin reproducirlo.
6. Completar kit de formularios, draft lists sin reenviar filas guardadas,
   `useActionToast` con resultado sin lanzar y retención de formularios ante error,
   `settleDebt` compartido con idempotencia estable, ajustes derivados de query,
   i18n/palette/contraste y accesibilidad. El objetivo de máximo 8 useState por
   vista, ausencia de window.confirm y eliminación de duplicados sigue pendiente.
7. Actualizar README e instrucciones operativas al comportamiento final. Ejecutar
   check completo, sandbox y smoke sintético de creación/edición, deuda, tarjeta,
   backup/restore y recarga. Detener servidores propios al terminar.
8. Revisar el bloque completo y publicar por el flujo normal ya autorizado: único
   PR en borrador, CI del SHA exacto, preview compatible, merge sin bypass y
   verificación de main/deploy READY/alias. Este checkpoint no autoriza su merge.

## Revisión de preservación

Antes del commit se revisaron 51 archivos pendientes, todos de `src/` y de este
refactor. `git diff --check` devolvió 0. El escaneo de patrones de credenciales
(no imprime valores) no encontró claves privadas, tokens conocidos, URLs con
credenciales ni literales de secretos de producción. No se incluyeron entornos,
metadata de Vercel, logs, datos reales ni archivos de otros proyectos.

El plan local bajo `docs/` está ignorado por Git. Se incluye abajo una copia
textual para que el traspaso no dependa del disco de la HP; sus referencias a
"siguiente integración" describen la planificación previa y deben contrastarse
con el estado parcial y los fallos documentados arriba. AGENTS.md local y logs
permanecen en la HP, sin agregarlos por fuerza al repositorio.

## Copia del plan local de ejecución

# Paquete 4 · Query, caché por entidad y vistas

Spec: plan delegado, fases 4 y 5, con compatibilidad para pestañas abiertas.
Base actual b0e698a; main 6701646. Tasks 1 y 2a completos y publicados en rama.
Ver PACKAGE4-CHECKPOINT.md para evidencia y rulings previos. Quedan dos PRs total;
este paquete debe producir un solo PR 4, el bloque 5 queda para ingesta/shared.

## Task 2b · datos y caché

1. Rutas aditivas wallet.reference y wallet.bootstrapReference. GET devuelve sólo
   diccionarios y metadata agregada de rango/meses/revisión, en un batch READ ONLY.
   Bootstrap devuelve esa referencia y la primera página completa. Conservar las
   rutas/payloads wallet.get y wallet.bootstrap para pestañas anteriores.
   Tests: no writes/historial, zona horaria, archivados, cursor, contrato HTTP,
   compatibilidad con cliente anterior. No requiere esquema ni migración.
2. QueryClient y opciones tipadas por entidad; transporte es el único retry GET.
   Claves reference, records+filtros, analytics+periodo+cuenta, card-summary,
   card-statements, card-records, card-payments. Tabla exhaustiva de mutaciones
   con invalidación selectiva. Tests MSW/Testing Library: bootstrap siembra cachés,
   settings no refetchea records, PATCH record sólo actualiza consultas afectadas,
   retry/401/no JSON/abort, lock borra caché y respuestas viejas no la recrean.
3. Integrar caches en consumidores y retirar WalletSync/localStorage. Provider sólo
   conserva estado/acciones de UI en contextos separados, sin componentes de UI.
   Estado de carga/error/refresco va en AppShell. Bootstrap no se descarta.
4. Antes de retirar historial del arranque: equivalentes de reportes/balances,
   proyecciones, goals, notificaciones y búsqueda. Mantener fórmulas, FX congelado,
   needs_review financiero, cancelados excluidos, fechas locales y archivados.
   Usar SQL para agregados; referencias/búsquedas/exportación no deben publicar
   un backup ni historial completo en la caché activa. Lecturas siempre sin writes.

## Task 3 · formularios y features

5. Kit de Field/Label/Input/Textarea/Select/Money/Currency/Date/Account/Category/
   Color/SegmentedControl/FormDialog/ConfirmDialog; fechas locales compartidas,
   monedas desde schema y controles accesibles. Sin window.confirm ni interactivos
   anidados; color de texto con contraste. No agregar productos o nuevas pantallas.
6. Records: separar draft/reducer, formulario, filtros, lista y review banner.
   Mover review actions/import history/category filter a componentes wallet.
   Regresiones de cuatro modos de submit, FX, plantilla/duplicación, metas, review,
   undo con expectedUpdatedAt y retención de drafts ante error/concurrencia.
7. Cards y resto: formularios y draft lists compartidos, settleDebt único con
   idempotencia por contenido; filas fallidas no reenvían filas ya guardadas.
   Ajustes derivados de query, i18n y palette. Cada vista con máximo 8 useState.

## Task 4 · cierre y publicación

8. runAction devuelve resultado sin lanzar; actualizar consumidores conservando
   formularios ante fallo. Tests de hooks/acciones y UI con Testing Library/MSW.
9. Check completo y sandbox con un worker en HP; smoke sintético con API/reload y
   frontend, luego detener servidores. README/AGENTS/OpenAPI al día. Revisión del
   paquete completo, resolver hallazgos importantes con RED→GREEN. Commits claros
   sin Co-authored-by, push seguro incremental. PR draft único, CI del SHA exacto,
   preview READY, merge normal, main CI/SHA/READY/alias y smoke GET sin sesión.

## Interfaces y rulings

- Bootstrap produce reference y RecordPage; queries deben sembrarlas con esas
  mismas claves/shape, sin refetch duplicado ni descartar primera página.
- API vieja conserva su contrato. Coste: mantener temporalmente el agregador legacy
  mientras los consumidores nuevos usan rutas de referencia/analytics paginadas.
- Los reportes consumían historial completo en JS. Retirarlo sólo cuando su DTO
  agregado preserve todas las salidas visibles; no usar una página parcial para
  totales, balances, review counts, proyecciones o resultados de búsqueda.
- No activar revocación, tocar secretos, borrar legacy ni reparar datos huérfanos.
  Apps Script activo queda fuera del paquete; backend debe aceptar el script viejo.
- No nuevas migraciones en este bloque salvo necesidad comprobada y autorización
  vigente con prueba sintética/destino/journal/recuperación. El frontend y sus
  lecturas aditivas no dependen de nuevas columnas.

## Siguiente integración (checkpoint de ejecución)

- SessionQueries debe entregar signal de sesión; createWalletMutations combina
  ese signal con cualquier signal de llamada. Probar aborto antes de enviar y
  durante el await de cancelQueries: una acción vieja no puede usar la sesión
  nueva mediante el getter estable del cliente. No reintentar mutaciones.
- Completar analytics.details con creditCardId opt-in para las tendencias de
  Cards (su scope anterior ignora la preferencia de cuentas ocultas). Sin filtro
  nuevo, conservar scope actual. Comparar SQL contra la fórmula anterior con
  movimientos sintéticos ocultos, FX congelado y cancelled/needs_review.
- GoalDetail no presenta un ledger de movimientos de reservas: no inventar una
  ruta que no necesita el UI. Tiene net reservations en reference, progress SQL
  y records con goalId paginado. CardsDetail necesita summary SQL + ledger de
  esa tarjeta; no calcular su total usando records parciales (hay legacy).
- Integrar las pantallas junto con App/Query para no producir una versión que
  interpreta referencia/página como snapshot. Puede prepararse la capa de hooks
  sin activarla. Provider sólo UI; dominio/queries fuera del provider.
- Los unit tests de vistas pueden conservar su mock useWallet con oráculos de
  read models derivados de los fixtures legacy. Agregar integración real con
  Query/MSW y HTTP sintético para probar que el wiring usa agregados completos,
  conserva la página de bootstrap, settings no lee historial y el caso gasto /
  meta / saldo fuera de página persiste al recargar y deshacer.
- Completar getCompleteDataset sólo para acciones explícitas (CSV, asistente,
  asociación histórica), sin publicarlo en caché activa; backup directo. Abortar
  lecturas/loops al bloquear. No traer wallet.get en inicio o después de mutar.
- Mantener snapshot del editor cuando desaparece de la página. Considerar el
  expectedUpdatedAt ya soportado para rechazar una edición normal obsoleta,
  con regresión de error y retención del draft antes de cambiarlo.

## Plan concreto para activar la caché (después del commit de hooks)

1. Mantener wallet-provider.tsx como barrel/alias del provider UI y mover la
   fachada useWallet a un hook de dominio. Generar aliases CRUD compatibles desde
   una tabla de operaciones; no reintroducir 52 wrappers dentro del provider.
   Acciones especiales de pagos/import/export usan mutaciones y signal de sesión.
2. getCompleteDataset puede usar wallet.get sólo por acción explícita, sin
   publicarlo en caché; conserva la snapshot completa/consistente para CSV,
   asistente y asociación histórica. getBackupDataset usa backup. No usar esas
   funciones en bootstrap, effects de vistas o refresh tras cada mutación.
3. App: QueryProvider → gate bootstrap → UIProvider → ThemeBridge/AppShell/Routes.
   Gate maneja carga/error/retry/lock fuera del provider UI. Tema desbloqueado
   deriva de reference.settings.theme. Estado global de queries/error/refresco
   debe renderizarse en AppShell, sin invalidar ni reintentar escrituras.
4. El initialMonth conserva currentMonth si existe en recordSummary.months;
   si no, usa el primero o currentMonth. Es la semántica del efecto anterior,
   incluso si existe un movimiento futuro. Month options usa metadata, no página.
5. La fachada dataset será referencia con arrays de historia vacíos. Antes de
   activar, cada consumidor financiero debe migrar: Dashboard (SQL summary,
   goals, balances/trend; recientes desde página sembrada), Analytics (modelo
   agregado), Accounts (balances), Goals (progress/balances), GoalDetail
   (progress y records goalId paginados), Cards (summary/usage/trend/agenda),
   CardDetail (summary SQL y ledger de una tarjeta). Jamás calcular totales
   usando los arrays vacíos o una página. Debts usa debtRecordCounts.
6. Records: useRecordForm ya mantiene snapshot; useRecordsView usa query de
   filtros/fechas locales con searchMode wallet/categoryMode descendants. Review
   usa recordSummary + merchantCorrections globales. Undo baseline puede ser
   RecordReviewBaseline. Quitar los flags globales de historial completo; mostrar
   estados de la query/paginación y no declarar completa una página parcial.
7. GlobalSearch usa sólo diccionarios; Notifications usa review agregado, deudas
   de referencia y agenda SQL. Imports usa metadata para resumen preliminar y
   snapshot explícita para diagnóstico/export. No afirmar salud desde arrays vacíos.
8. Unit tests existentes que mockean useWallet pueden adaptar read models desde
   fixtures legacy para preservar los oráculos previos. La integración real con
   Query/MSW/HTTP debe cubrir wiring y ausencia de wallet.get en inicio/mutación.
   Eliminar tests de WalletSync/localStorage al retirar esos módulos, manteniendo
   sus invariantes vigentes (no stale overwrite, lock clear, errores visibles,
   backup separado) en tests del reemplazo. No borrar cobertura sin reemplazo.
