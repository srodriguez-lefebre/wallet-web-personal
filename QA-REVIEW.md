# Revisión independiente del QA

Base: `87b6b0bff6ca14540a09830cc8f2c965181b2d14`.
Rama: `fix/qa-records-card-context`. Verificación: 13–14 de noviembre de 2026.
No se modificaron registros reales, credenciales, migraciones, contratos API ni
cálculos de dinero. No se hizo merge ni despliegue.

## Contexto consultado

- Historial autorizado de Dot, búsqueda `wallet` y lectura del mensaje de
  Santiago del 13/11 23:49 UTC (`Sentinel_17a45e6e21d481919b3cd7eb462d49f3`),
  incluido el QA del 13/11 22:41 UTC
  (`Sentinel_d9bb7cda96d88191b503f93e34d769cf`). También se consultaron los
  informes y propuestas del 13/11 19:58, 20:05 y 20:09 UTC. Las propuestas de
  Dot se trataron como propuestas; la solicitud posterior autoriza resolver
  los pendientes identificados.
- No hubo una herramienta disponible para leer directamente todos los chats
  nativos de Codex de esta carpeta. El coordinador aportó el contexto del chat
  «Analizis y mejora de wallet» (`01a0ffa6-5cd5-7771-9f14-8b34079fcb79`): se
  preservaron revisión nuevos/vistos, corrección desde fila, Deshacer, historial
  de importación separado, sugerencias sin autoaplicar por defecto y separación
  de compras/pagos. Esa consulta fue indirecta, no una lectura íntegra del chat.
- Se contrastó con AGENTS.md suministrado, README, `git log`, diff del commit
  base, código, pruebas y los planes históricos `docs/PLAN.md` y `docs/plan-1.md`.
  `.agents/skills` no existe en este checkout. Los planes no se trataron como
  comportamiento implementado ni como nuevas autorizaciones.

## Cambios

1. Categories usa `bg-card` y `text-card-foreground`, definidos en ambos temas.
   Conserva portal, límites de ancho/alto, scroll y manejo de foco de Radix.
2. Compras y pagos en Card Detail usan `format(parseISO(...), "dd/MM/yyyy")`,
   coherente con la zona local usada por Records/Dashboard. Las fechas sin hora
   no cambian de día. Editar sin cambiar la fecha conserva el timestamp original
   completo, incluidos los milisegundos.
3. Cards identifica el ciclo abierto y su cierre. Solo muestra vencimientos de
   estados cerrados con saldo pendiente, mediante el selector existente de la
   agenda. Incluye los atrasados y permite abrir el estado exacto. El total
   adeudado se etiqueta Outstanding. No se cambió el cálculo financiero.
4. WalletProvider conserva período, mes, rango personalizado y todos los filtros
   antes de abrir la cola global. El botón y la × de Status restauran el contexto,
   también tras navegar fuera de Records. Notificaciones y búsqueda usan la
   misma entrada. Clear all/Reset y una búsqueda nueva descartan explícitamente
   el contexto anterior. No se persiste este estado de navegación tras recargar.
5. Add filter · Note enfoca el textarea solo al abrirlo explícitamente. Un filtro
   restaurado, un render posterior o una navegación no roban el foco.

## Reproducir sin datos personales

```powershell
npx tsx scripts/sandbox/qa.ts
```

Abrir `http://127.0.0.1:4175`, código de prueba `wallet-local-test`.
El script usa PGlite en memoria, las migraciones y la API reales; desactiva
credenciales heredadas, lectura de `.env` y conexiones externas. No usa
`.local-wallet` ni respalda/restaura datos del usuario. El fixture tiene fechas
fijas de septiembre/noviembre de 2026; los ciclos abiertos siguen el reloj actual.

1. En Records elegir noviembre, QA Bank, Cleared, categoría QA Food y Note
   `mixed lunch`. Debe aparecer QA Night purchase. Probar quitar cada filtro y
   Clear all. Una búsqueda inexistente debe explicar el estado vacío.
2. Abrir Needs review: aparecen QA New review de noviembre y QA Old review de
   septiembre/QA Cash, sin las restricciones anteriores. Ver un nuevo y un visto.
   Salir con el botón, repetir y salir con la × de Status: se recuperan los
   filtros. Repetir navegando a Cards y volviendo antes de cerrar la cola.
3. En el fixture, Save and mark reviewed debe reducir la cola a uno; Undo la
   devuelve a dos. Recargar y reabrir la cola verifica el estado canónico de la
   API. No repetir este paso en producción con datos reales.
4. Abrir Categories, llegar a QA Category 45 y seleccionarla. Verificar scroll,
   cierre, foco de vuelta al selector y fondo opaco en Light/Dark (Settings >
   Theme). Probar viewport de 390 px sin scroll horizontal.
5. Add filter · Note debe permitir escribir inmediatamente; cerrar/quitar y
   reabrir debe reenfocarlo. Restaurar un filtro existente no debe enfocarlo.
6. Dashboard/Records muestran QA Night purchase el 12/11 a las 23:38 en Uruguay;
   Card Detail muestra compra y pago el 12/11. El timestamp de prueba es
   `2026-11-13T02:38:00Z`. Las pruebas automatizadas incluyen `2026-11-13` sin hora.
7. Cards > QA Current muestra el ciclo abierto sin vencimiento cerrado pendiente.
   QA Pending conserva el estado cerrado el 3/11, vencido el 12/11 por 500 UYU.
   El test automatizado fija el reloj al 13/11 para este caso.

Detener al terminar:

```powershell
curl.exe -X POST http://127.0.0.1:4175/__qa/stop
```

## Evidencia y límites

- Navegador local Chromium/Vivaldi: cola global, restauración después de navegar,
  Note y búsqueda parcial, selección/cierre exterior, Clear all, fechas en las
  tres vistas, estados de tarjeta y Save/Undo con recarga verificados.
- Categories claro: fondo `rgb(255, 255, 255)`, texto `rgb(15, 23, 41)`.
  Oscuro: fondo `rgb(18, 25, 43)`, texto `rgb(241, 245, 249)`.
  Scroll interno: 287 px de alto visible frente a 2168 px de contenido.
- Viewport de 390 px: ancho del documento 390 px, selector entre x=37 y x=353.67.
  Se seleccionó la última categoría, cerró y devolvió el foco a Category.
  Se restableció el tamaño del navegador al terminar.
- Escape no pudo confirmarse mediante la automatización del navegador: el panel
  permaneció abierto al enviar esa tecla. No se cambió ese manejo de Radix; se
  deja explícitamente para comprobación manual independiente.
- No hay una nueva suite E2E automatizada: el recorrido anterior fue una sesión
  de navegador y el script permite repetirla. Los tests React no reemplazan esa
  comprobación visual.
- El primer test integrado dentro del sandbox agotó 60 s al iniciar PostgreSQL.
  Fuera de esa restricción, la suite completa pasó: 75 archivos, 646 pruebas,
  una omitida por Windows (`workspace.test.ts`, permisos POSIX).
- Un primer `check` llegó al build y detectó TS2322 en el tipo de un mock nuevo;
  se corrigió y `npm run build` pasó después. El `npm run check` final terminó
  con código 0: lint, 75 archivos / 646 pruebas aprobadas / una omitida, build y
  `api:spec:check`. Log local: `C:/Users/savar/AppData/Local/Temp/wallet-qa-final-check.log`.
  El servidor sintético se detuvo y se verificó que el puerto 4175 no quedó abierto.

Comandos de revisión:

```powershell
git diff 87b6b0b..fix/qa-records-card-context
npm test -- src/providers/wallet-provider.test.tsx src/views/records-view.test.tsx src/views/card-agenda.test.tsx src/components/wallet/global-search.test.tsx src/components/wallet/wallet-notifications.test.tsx
npm run check
```
