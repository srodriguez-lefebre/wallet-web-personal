# Paquete4 · checkpoint local

Base708309dc029bd5d7e2c5a0b16372f6ac1120b744, rama refactor/04-entity-cache-views,
worktree /home/santi/proyectos/wallet-web-personal-package4. Checkout candidato3
/home/santi/proyectos/wallet-web-personal sigue limpio en708309dc y no se modifica.
No push/PR/preview, cambios remotos, migraciones, secretos ni Apps Script.

Plan: docs/refactor-2026-11-14/PACKAGE4-PLAN.md (local ignorado).

# SDD ledger — plan: docs/refactor-2026-11-14/PACKAGE4-PLAN.md

Ruling: helper de workspace de skills cloud no está en filesystem local; ledger
manual tracked aquí, con tests/logs en /tmp. Costo: retomar desde este archivo y
commits en lugar del helper, sin descartar evidencia.
Ruling: tool create_worktree confirmó Cloud worktrees are unavailable; fallback
Git en directorio hermano del mismo repo para no tocar .gitignore del candidato3.
Dependencias propias instaladas desde lockfile; ninguna env o metadata copiada.
Pre-flight: tipos response actuales son ZodType amplio; preservar runtime/schema
mientras se hace explícita la relación operationId→response para el cliente.

Bloqueo externo de publicación3 (no repetir solicitudes ni ampliar permisos):

- Falta hostname o ID del endpoint productivo y rama/ventana de recuperación Neon
  vistos desde un origen independiente de envlocal. No hace falta secreto alguno.
- .env y .env.local sólo coinciden entre sí; Vercel DATABASE_URL sensible no admite
  readback. get_project aporta metadata de deploy, no storage/hostname.
- Conexiones Vercel del proyecto404 Connector Project not found; lista integración
  Neon403 sin permiso de listar configuración. No reintentar sin evidencia nueva.
- No Vercel CLI ni Neon CLI instaladas/configuradas; GH CLI autorizado sólo GitHub.
- Chrome estuvo desconectado. Se recuperó después: consola Neon muestra Log in to Neon, sin sesión existente. Pestaña dejada para login del dueño; no se pulsó SSO ni se aceptaron permisos.
- Camino seguro: sesión existente Neon/Vercel recuperada y lectura de endpoint,
  branch y recovery metadata, o metadatos no secretos del dueño. Después preflight
  READ ONLY con fingerprint antes de conectar y guards de journal/schema. No
  explorar puertos de debugging, logs con secretos, crear claves ni copiar DB real.

Estado: task1 preparado y validado, sin consumidores UI. Tareas2–5 pendientes; esto no es el paquete4 completo.
PRs usados2/5 (#9,#10); candidato3 sin publicar; esta rama será un único PR4 futuro.

## Publicación segura parcial solicitada después

Se revisaron vercel.json y CI: preview automático de ramas, CI Actions sólo
pull_request y pushmain. Sin ignoreCommand/deploymentEnabled configurados. No se
verificó un marcador de mensaje para omitir sólo Vercel; no se cambió configuración
ni se usó skipci. Referencia oficial consultada: https://vercel.com/docs/project-configuration/git-configuration

Subido únicamente40c2cdaa1222e993b306a237bf1cae53a1e036c9 a
origin/refactor/03-contract-router. GitHub branch API confirma head; commitstatus
Vercel success, preview READY dpl_3tSxsfdKdK7yQ4E35Tsnmc7YDPW3, URL
wallet-web-personal-kx9cxj6d6.vercel.app. Raíz/health302 porprotección, sin bypass ni
prueba autenticada. No CI Actions aún porque nohayPR. No se cambió main ni alias.
Candidato3 708 se conserva local; rama4 hereda708 y tiene la misma excepción por
0022: no subir este head ni crear PR4hasta verificar/aplicar la ampliación.

Task1: cliente nuevo sin consumidor UI. Métodos/params/query/body/respuesta desde
contrato, separación de sesión/ingest, callback401 antesdeJSON, errores legibles,
AbortSignal, retryúnico GETtransitorio/ningunamutación. Registro de schemas mantiene
tipos de response sin modificar OpenAPI. No retirar wrappers/provider hasta
integración del paquete4. Baseline acotado2/5pass.
Setup: npmci ignore-scripts omitió symlinks de libpq; npmrebuild del paquete oficial
@embedded-postgres/linux-x64 los restauró. No cambió lockfile, schema ni prod.
RED inicial por módulo cliente faltante; pruebas funcionales detectaron prefijoAPI
duplicado y quedaron GREEN2/18. Revisión independiente encontró body opcional en
tipos cuando el objeto es obligatorio. Tres aserciones TypeScript RED→GREEN
(body ahora opcional sólo si schema acepta undefined; query sigue normalizando{}).
Target final2/19pass; tscgreen. Fullcheck4 final100/743pass, exit0: formato, lint, tests, build y OpenAPI. OpenAPI/lockfile/schema sin cambios. Logs /tmp/wallet-package4-check4.log y /tmp/wallet-package4-review-green.log. No otros hallazgos de revisión.

## Puerta y siguiente paso

Task1 validado como preparación aislada, no integración UI. Check completo final
100archivos/743tests exit0. La revisión señaló sólo body opcional; corregido con
aserciones TypeScript RED→GREEN y suite final verde. No hallazgos abiertos ni
minors diferidos. Sandbox explícito: exit0, 10 archivos/104tests; /tmp/wallet-package4-sandbox.log.
No se ejecutó QA autenticada real ni se dejaron servidores. Nuevos métodos aún
no tienen consumidores de UI; el bundle de la app conserva su hash anterior.

Futuro: integrar main mediante merge normal cuando se publique3, sin reescribir
este commit ni708/40. Task2–5 siguen pendientes; un único PR4cuando todo su paquete
esté validado y compatible. Nunca publicar este head apilado mientras0022 esté
sin verificar/aplicar. No activar revocación, crear secretos o tocar Apps Script.

Paso externo concreto: Santiago inicia sesión en Neon en la pestaña existente de
Chrome HP (console.neon.tech; mostraba Log in to Neon), con su cuenta ya creada.
No compartir password/token/URL completa. Entonces leer proyecto/rama/hostname y
metadata de recuperación; comparar host con huella local, preflight READ ONLY del
journal/schema y guards del checkpoint3 antes de aplicar sólo ampliación compatible.
Alternativa: facilitar sólo hostname/ID, rama/proyecto y ventana de recuperación
verificados. CLI GitHub no sustituye autorización Neon; Vercel/Neon CLI no tienen
configuración disponible y la integración Vercel dio403. No introducir bypass.

Commits: títulos descriptivos, sin Co-authored-by; no reescribir historia ni publicar este head bajo la excepción0022.

## Integración con main publicado (actualiza bloqueos anteriores)

PR11 fusionado en670164637a44b60a641c76a563bf5e186343b765, CIhead43611856122
success y CImain43612282124success. Vercelproduction READY
dpl_ANvFnKmCHVtdQYFvHWTDg4ynDyNY y aliaswallet-web-personal.vercel.app mismoSHA.
Migración0022yaaplicada, postflight pending[], journal0–21intacto/única22añadida;
no FK/droplegacy/revocación/secreto nuevo. Rama diagnóstica targetverification no
se integra. 3/5PRusados. Se levantó la excepcióndepush4, despuésdeintegrarmain y
validarheadexacto. Todavía noPR4: unpaquetecompleto, máximo5total.

Merge normal deorigin/main sobre300db45 sinreescribirhistoria ni perder708. El
fullcheck de integración se inició sin cambios adicionales en código productivo.
Ruling: callback401recibeeltokenusado yAuthProvidercompara la sesiónvigente:
unarespuestaantiguaA no debe cerrarnuevaB. Clienteestable congetteractual y
unlockpúblico usa el mismotransporte; retener listenerlegacy hasta migrarwrappers.
Coste: coexistenciatemporal documentada, sin wire incompatible ni bloqueo de tabs.

Integración verificada: npmruncheck exit0,100archivos/749tests; formato/lint/build/
OpenAPIgreen. Log /tmp/wallet-package4-main-integration-check.log. El código del
cliente300 permanece intacto. SiguienteTDD: authclient4regresiones de sesión; todavía
noafirmarintegraciónQuery ni retiroWalletSync. NoCo-authored-by en commitsnuevos.
