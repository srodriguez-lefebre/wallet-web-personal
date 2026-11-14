# Refactor Wallet · checkpoint de ejecución

Fecha: 2026-11-14. Host: server-miapto. Repositorio: srodriguez-lefebre/wallet-web-personal.
Base contrastada: main remoto y checkout limpio en 459f546 (incluye PR #8).
Spec: PLAN-REFACTOR-wallet-web-personal.md provisto íntegro por Santiago en la delegación.

## Alcance y compatibilidad

Máximo **cinco PRs nuevos** para el refactor completo. Borrador primero, checks del SHA exacto antes de merge, integración normal de Vercel. Sin force push, sin cambios en otros proyectos, secretos ni permisos. Una función y rewrite actual; misma base Neon. El Apps Script activo lo actualiza Santiago.

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
- [ ] npm run check y sandbox sintético del SHA final del paquete 1.
- [ ] PR 1 borrador, CI, merge y Vercel READY + alias.
- [ ] Paquetes 2–5.

## Retomar

Continuar en refactor/01-foundation desde el primer checkbox pendiente. No crear PR adicional si ya existe uno para el paquete: buscar por rama. Mantener aquí enlaces, SHAs, pruebas y cualquier bloqueo real. Nunca interpretar una fase parcial como completada.

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
- El Apps Script activo se coordina en el chat separado de la HP, según la última
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

### Bloqueo de publicación del paquete 1

La rama `refactor/01-foundation` está publicada por SSH usando la autorización
existente. La integración GitHub rechazó `create_pull_request` para este repo
con **403 Resource not accessible by integration**. No se creó ningún PR (búsqueda
por rama confirmó lista vacía). No es un rechazo de auto-review.

Chrome también muestra **Sign in**, sin sesión GitHub activa. No se inició login,
no se cambiaron claves ni permisos y no se reintentó la creación por otra vía.
Se dejó abierta la comparación para iniciar sesión con la cuenta existente:
https://github.com/srodriguez-lefebre/wallet-web-personal/compare/main...refactor/01-foundation

Paso del dueño: iniciar sesión en GitHub en Chrome de la HP y avisar; o crear
allí **un único PR en borrador** desde la rama publicada hacia main y compartir
su número. No ampliar scopes ni registrar claves. Antes del merge hay que
comprobar CI del SHA final, pasar el borrador a listo y fusionar con guard de SHA.

Hasta resolverlo: PRs creados para el refactor = **0 de 5**; no se fusionó ni se
lanzó despliegue. Producción verificada por Vercel seguía READY en 459f546,
dpl_5AgD94n9793FVe4G6tksPk7isDUH; alias wallet-web-personal.vercel.app.
Las fases 1–6 y sus posibles migraciones/Apps Script siguen pendientes; no están
implementadas ni activadas por este paquete.
