# Refactor Wallet · checkpoint de ejecución

Fecha: 2026-11-14. Host: server-miapto. Repositorio: srodriguez-lefebre/wallet-web-personal.
Base contrastada: main remoto y checkout limpio en 459f546 (incluye PR #8).
Spec: PLAN-REFACTOR-wallet-web-personal.md provisto íntegro por Santiago en la delegación.

## Alcance y compatibilidad

Máximo **cinco PRs nuevos** para el refactor completo. Borrador primero, checks del SHA exacto antes de merge, integración normal de Vercel. Sin force push, sin cambios en otros proyectos, secretos ni permisos. Una función y rewrite actual; misma base Neon. El Apps Script activo se coordina con Santiago desde el editor de Google en Chrome de la HP; no requiere un chat con ese nombre.

La autorización más reciente permite migraciones compatibles/no destructivas tras ensayos sintéticos, verificación del destino, estado real y recuperación. No permite pérdidas irreversibles, rotación/creación de secretos ni cambios de seguridad productiva. No ejecutar drop legacy con datos reales. No crear ramas Neon con copias reales. No smoke autenticado ni bootstrap productivo.

| Paquete / PR                        | Trabajo                                                          | Compatibilidad y publicación                                                                                                                                                                    |
| ----------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · Base                            | 0.1–0.4: formato, lint/TS, regresiones, infraestructura CI/tests | Publicable sin migraciones ni cambio de sesión. Formato en commit separado.                                                                                                                     |
| 2 · Repositorio y sesión compatible | 1.2–1.3, 2.1–2.3; preparar 1.1 sin invalidar sesiones existentes | Separar activación de revocación si exige secretos, corte de sesiones o migraciones pendientes. Conservar tabla legacy. Migraciones aditivas primero; versión anterior debe seguir funcionando. |
| 3 · Contrato y router               | 3.1–3.3, request DB único, módulos, lecturas puras, agregados    | Mantener snapshot legacy hasta migrar todos sus consumidores. Endpoints nuevos aditivos. Mismo payload de ingesta.                                                                              |
| 4 · Cliente y vistas                | 4.1–4.4 y 5.1–5.3                                                | Migrar consultas y vistas conjuntamente preservando los cinco arreglos del PR #8. Quitar snapshot legacy solo al demostrar compatibilidad de clientes.                                          |
| 5 · Ingesta y shared                | 6.1–6.5, código optativo Apps Script y guía manual               | Backend acepta script actual y nuevo. Cambios de proveedor detrás de contratos compatibles; migraciones aditivas. Santiago actualiza Apps Script.                                               |

## Auditoría breve contra código

- Confirmados: wallet-repository.ts monolítico y defaults createDb por operación; getWalletDataset/listCreditCardStatements escriben al leer; router manual; fallback SESSION_SECRET → API_TOKEN y sub derivado del maestro; snapshot completo en localStorage; react-test-renderer; CI duplicada push/PR.
- deleteAccount/deleteCategory ya usan batch pero faltan referencias de plantillas/auto-reserva; deleteTag ya limpia enlaces y budgets en batch. No reescribir lo que ya funciona.
- README indica migraciones 0018–0020 pendientes; esto es documentación, **no evidencia del estado real productivo**. No habilitar código dependiente sin inspección autorizada del destino.
- Índice inicial: cero archivos CRLF (el diagnóstico del plan sobre 162 ya no aplica). Cinco BOM encontrados (README y cuatro vistas), no cuatro.
- .agents/skills no está presente en este checkout ni en el catálogo del directorio padre. Se usan skills disponibles del entorno.
- Auditoría externa de Claude: no es necesaria para demostrar los hallazgos; no acceder a sesiones privadas.
- GitHub conectado: permisos push/admin existentes confirmados. SSH requiere ignorar configuración global defectuosa con ssh -F /dev/null; no se cambian claves ni permisos. Fetch autorizado confirmó main.

## Verificación y progreso

- [x] Plan releído, README/AGENTS y base remota contrastados.
- [x] 0.1 configuración y formato, commit separado (ver git log).
- [x] 0.2 lint/TS estrictos (ver excepciones documentadas).
- [x] 0.3 cascadas, filtros y summary con router real y tests sintéticos.
- [x] 0.4 infraestructura aislada y providers con Testing Library.
- [x] npm run check del SHA 9c32a5b: 80 archivos / 662 tests; sandbox: 10 / 103 y smoke sintético completo.
- [x] PR #9 borrador → listo → merge f1cd16f, CI verde y producción READY con alias.
- [ ] Paquetes 2–5.

## Retomar

Continuar en refactor/02-repository-session-compatible desde la verificación del paquete 2. Base actualizada por fast-forward a f1cd16f; preservar el árbol local. No crear PR adicional si ya existe uno para el paquete: buscar por rama. Mantener aquí enlaces, SHAs, pruebas y cualquier bloqueo real. Nunca interpretar una fase parcial como completada.

## Decisiones de implementación del paquete 1

- Las rutas y los payloads actuales se conservan. El contrato se tipa mejor para
  evitar indexar un schema inexistente; no se modifica ninguna operación.
- `exactOptionalPropertyTypes` queda fuera de esta fase como permitía el plan.
- Excepción de lint limitada a tests: pg y ReactTestInstance.props exponen `any`;
  los seis rules `no-unsafe-*`/`require-await` se excluyen allí, manteniendo las
  reglas de promesas. No se excluye código productivo. Las pruebas conservan
  typecheck y `noUncheckedIndexedAccess`; los valores garantizados por fixtures
  se afirman de forma explícita. Riesgo: esas APIs de fixtures siguen sin tipado
  estructural completo, pendiente de reemplazar el resto de react-test-renderer.
- Un clúster PostgreSQL temporal por ejecución y clones por archivo sustituyen
  clústeres completos por archivo. Dos workers limitan la RAM de PGlite en la HP.
  Los tests no comparten filas. No se cachean bases inicializadas; los archivos
  de PostgreSQL/PGlite vienen en paquetes npm cubiertos por la caché de npm.
- El baseline restringido tuvo timeouts; las pruebas aisladas con acceso a
  localhost (auth y PGlite) pasaron. Ese ensayo fue detenido. No cuenta como
  baseline completo aprobado ni como evidencia de regresión del código.
- El Apps Script activo se coordina desde el editor de Google en Chrome de la HP, según la última
  dirección de Santiago. Este refactor sólo prepara código/bundle y prueba
  compatibilidad antes de coordinarlo; no edita cuenta, permisos ni triggers.

### Revisión y correcciones antes de publicar

- Revisión independiente contra 459f546: un hallazgo P2 en cierre de sockets
  PostgreSQL. Regresión observada RED → GREEN; `trackPoolShutdown` se comparte
  entre el clúster y los clones y espera `end` de cada cliente.
- Se detectó además un falso positivo de CI: importar embedded-postgres en el
  coordinador de Vitest instala un hook beforeExit que fuerza código 0.
  Regresión con un Vitest hijo deliberadamente fallido confirmó RED (exit 0)
  y GREEN (exit 1). El clúster corre ahora en un proceso hijo con IPC; sus hooks
  no alteran el resultado de Vitest. La fixture fallida está fuera del glob normal.
- React espera eventos void. Las mutaciones nuevas usan `finishAction` únicamente
  donde el action toast ya informa errores, evitando rechazos sin manejar.
  Se conservan tests de drafts/reintentos/idempotencia y se verifica el toast de
  error en vez del valor de retorno de un evento de DOM. 17 tests afectados pasan.
- Navegador Chrome en QA local: desbloqueo, alta de un gasto sintético UYU 12,34,
  edición de notas y recarga. No se usa token ni datos de producción.

### Publicación de la base y recuperación de la HP

- PR #9: https://github.com/srodriguez-lefebre/wallet-web-personal/pull/9
  Head `9c32a5bb42571ad43d5e1486a4efbeccb47a563f`; merge
  `f1cd16f97085ca4e201037c87fffec300afa5d24`. CI del head y del main verdes.
- Producción READY en `dpl_6MLttNrtDy2wcZLByVBeQ1XvGjRS`, commit f1cd16f;
  alias https://wallet-web-personal.vercel.app. Smoke sin sesión: raíz 200,
  health y summary anidado 401 JSON del router. URL concreta protegida devuelve
  302; no se presenta esa redirección como prueba de aplicación autenticada.
- El bloqueo del conector GitHub (403 al crear PR) fue resuelto operativamente
  con la sesión existente de Chrome. Santiago instaló y autorizó `gh` después;
  su cuenta y acceso al repo se verificaron sin mostrar tokens ni cambiar scopes.
- PRs utilizados: **1 de 5**. No recrear ni volver a fusionar #9.
- La terminal dejó de responder durante el cierre local del paquete 2. Al volver
  la HP, `pwd` y `git status` confirmaron el árbol preservado y el lint ya terminado.
  No se reinició la máquina ni se interrumpieron procesos ajenos.

## Paquete 2 · repositorio y protección compatible

Rama `refactor/02-repository-session-compatible`, basada en main f1cd16f.

- Repositorio por agregado en `server/db/`, DB explícita primero y una fábrica
  lazy memoizada por request. Cuerpo de unlock inválido no crea cliente.
- Helpers compartidos de mappers, patches parciales, errores PG, batches nombrados,
  locks `SELECT FOR UPDATE` ordenados y FX histórico en SQL. Se mantienen tasas
  directas/inversas y puentes ordenados, sin inventar conversiones.
- Creación simple delega al bulk, preservando conflicto de deuda duplicada.
  Recurrentes usan un `INSERT SELECT generate_series` con fechas UTC al mediodía,
  límite de último día y el índice único existente desde 0006.
- Limpieza atómica de referencias de templates y auto-reserva al archivar;
  tarjetas vuelven a debit; patchSettings no cambia paymentType implícitamente.
  Patches concurrentes de budgets/planes escriben sólo campos enviados.
- Reservas se suman como numeric en SQL; reembolsos conservan la guarda SQL
  atómica sin el precheck de floats. Se conserva todo el historial financiero.
- Caché v3 sólo de referencia, allowlist estricta, 128 KiB y limpieza de cachés
  viejas/inválidas. Sin records, actividad de tarjeta, pagos ni deudas en disco.
- Rate limit atómico por IP (5) y global (20), 15 minutos; el éxito sólo limpia
  la IP. Se conserva el formato de sesión y los secretos existentes.

### Matriz de compatibilidad y recuperación

| Superficie            | Este paquete                                         | Requisitos antes de publicar                                                                   |
| --------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Schema / migraciones  | Sin cambios en schema, journal ni SQL de migraciones | Ninguna migración nueva; no ejecutar db:migrate para este PR                                   |
| Backend anterior ↔ DB | Misma estructura y contratos                         | Rollback al despliegue anterior no exige reversión de datos                                    |
| Sesiones              | Mismo payload/firma; sin corte de sesiones           | Revocación versionada y secreto obligatorio separado quedan pendientes                         |
| Apps Script actual    | Payload, endpoint e idempotencia sin cambios         | No editar Head/trigger; preparar bundle compatible en paquete 5                                |
| Backups               | Mismo schema y tabla legacy conservada               | Ensayar restauración sintética antigua/completa y reload antes del PR                          |
| Browser cache         | V2 se descarta y se vuelve a consultar la API        | Puede haber carga inicial sin historial hasta sincronizar; no se pierde historial del servidor |

No se consulta ni copia contenido financiero real para estos ensayos. Las pruebas
aplican las migraciones versionadas a PostgreSQL/PGlite temporales y verifican
rollback de batches y restauración. README antiguo no demuestra el estado de las
migraciones productivas; no afirmar que están o no aplicadas sin inspección del destino.

### Pendientes explícitos de los paquetes siguientes

- 1.1 sesión revocable/versionada: requiere diseño de transición sin invalidar
  sesiones ni exigir secretos nuevos por cuenta propia. No está activada.
- Poda persistente del rate limit; 2.3 singleton de settings, índices, FK,
  soft-deletes y timestamps nuevos. Preparar migración aditiva y preflight del
  destino/recuperación con publicación ordenada en paquete 3. No ejecutar drop
  legacy: conservar tabla y lectura de respaldos viejos hasta evidencia suficiente.
- 3 router por contrato, lecturas puras, agregados; 4 cliente/caché por entidad;
  5 vistas; 6 ingesta/shared. No presentar este paquete compatible como fase 2
  íntegra ni como refactor terminado.
- Apps Script: guardar Head podría activar processPendingEmails. Entregar bundle,
  commit, prueba script viejo/API nueva, claves estables y orden compatible antes
  de coordinar la edición en Chrome; no ejecutar lote real ni modificar triggers.

### Revisión del paquete 2

Revisión independiente contra f1cd16f: sin hallazgos adicionales confirmados.
El caso de tasa almacenada NaN quedó reproducido RED (NaN en vez de 40) y
corregido filtrando NaN antes de seleccionar la última tasa válida. Se corrigió
además un mock de vista que aún usaba la firma anterior de createRecord.
La semántica de recurrentes se contrastó con el repositorio productivo base,
no con el helper shared sin consumidores que se eliminó.

### Puerta de publicación del paquete 2

Verificado: revisión independiente; fixes/backup/restore legacy 4 archivos / 33
tests; smoke en Chrome (alta, edición y recarga) y API (pago/reintento idempotente,
consumo/summary de tarjeta, restore y reload) con fixtures sintéticos. QA detenido.
Esquema, migraciones, contrato OpenAPI y vercel.json iguales a main.

Check completo exit 0: formato, lint, 87 archivos / 688 tests, build y spec.
Sandbox exit 0: 10 archivos / 103 tests. Logs locales en /tmp/wallet-package2-\*.

Pendiente: un único PR borrador contra main, CI/preview del head exacto,
merge con guard de SHA, CI main y Vercel READY/alias. Registrar evidencia aquí.
