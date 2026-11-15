# Paquete 5 - revisión y migración verificadas; checkpoint previo al merge

Base: `2b393e60a57cb79b77e7713d2b023eef01dd0fb4` (PR #12 ya desplegado).
Rama única: `refactor/05-ingestion-shared`. PR final único: [#13](https://github.com/srodriguez-lefebre/wallet-web-personal/pull/13), abierto en borrador.
El checkout original de la G14 se conserva; el trabajo vive en su worktree aislado.

## Implementación y evidencia

- Parsers por tipo y normalización TS compartida con el IIFE de Apps Script;
  generación determinista y sandbox que ejecuta los tres `.gs` reales.
- Políticas por `systemKey`, búsqueda SQL de candidatos y correcciones; respaldo
  compatible de políticas y claves de categorías. Fuentes canónicas tipadas con
  compatibilidad para etiquetas históricas.
- Proveedores acotados, circuitos persistentes con recuperación exclusiva y poda
  horaria. Sin equivalencias FX inventadas ni clasificación de un procesador vacío.
- Cálculos por dominio y un cálculo de saldos con cutoff; reloj explícito; esquemas
  por entidad y tipos inferidos. Importadores con validación previa y un batch con locks.
- Migrador específico de 0023 con DDL y journal atómicos, guard del predecesor,
  comprobación posterior y recuperación de una respuesta perdida sin reproducir DDL.

Checks locales completos posteriores a la revisión: 136 archivos, 929 pruebas aprobadas, una omisión de
plataforma Windows; formato, lint, `mail:check`, tipos, build y OpenAPI aprobados.
Sandbox: 11 archivos, 108 aprobadas y la misma omisión. Se usaron datos sintéticos.
La revisión independiente de toda la rama y sus correcciones preceden al merge.

La única revisión independiente detectó cuatro hallazgos Important y uno Minor,
recalificado como Important por el riesgo de repetir un reemplazo ya confirmado
en la base. Se corrigieron en una sola pasada RED→GREEN: importes completos en
TS/GS, claves por encima de nombres y categorías eliminadas, procesadores con
sufijos bancarios, claves en backups antiguos con IDs distintos o base nueva y
resultado incierto de importadores tras perder la respuesta. El primer conjunto
de regresiones dirigido terminó con 37 pruebas aprobadas; los checks completos
posteriores se registran en la evidencia de release. No quedaron menores diferidos.

El destino Neon fue cotejado con su consola autenticada y la configuración local.
El preflight de sólo lectura confirmó 23 entradas anteriores, hashes históricos
reconocidos y únicamente 0023 pendiente; columnas e índices de baseline sin deriva.
0023 se aplicó con el migrador atómico revisado y se verificó de nuevo por metadatos:
24 filas de journal, prefijo anterior intacto, ninguna migración pendiente,
columnas e índices sin deriva y cuerpos de ambas funciones coincidentes.
Hash: `49ba968f005baa6866699ba7cf0450e5ead6da63f1cd6db5d386f42cab0cfd8c`.
No se hizo bootstrap ni se ejecutaron pruebas o importadores sobre datos productivos.
En este checkpoint quedan CI, preview del SHA final, merge y alias productivo;
su evidencia posterior se registra en el PR y en el informe de cierre.

## Decisiones y costos

1. Ejecutar la fase 6 ya autorizada sin reiniciar la aprobación de diseño. El plan
   de ejecución es derivado: el original se leyó en Library, pero sus dos intentos
   de materialización local fallaron. Costo: el archivo original no está materializado.
2. Conservar el catálogo manual y aprendido y guardar fallbacks/overrides en
   `merchant_category_rules`, en vez de disputar sus aliases únicos. Costo: una
   colección adicional en el backup; evita cambiar identidades financieras canónicas.
3. Mantener `provider_state` fuera del restore financiero, como el estado de intentos
   de autenticación. Costo: restaurar un JSON no reinicia circuitos ni marcas de poda.
4. Usar tres fallos y cinco minutos para el circuito, valores no fijados por el plan.
   Costo: durante ese intervalo se conserva Needs review y se omite el proveedor.
5. Retener Frankfurter v2 tras verificar UYU y ARS en su catálogo oficial. Costo:
   continúa esa dependencia externa, ahora limitada y con validación estricta.
6. Conservar fuentes históricas de texto y campos opcionales de lectura sin debilitar
   creación o patches. Costo: el enum canónico convive con etiquetas heredadas.
7. Rechazar CSV inválido, FX sin referencia válida y transferencias sin mapeo antes
   de reemplazar datos. Costo: los archivos ambiguos necesitan corrección o importación
   por el API con cuentas explícitas; no se inventan importes o destinos.
8. Conservar referencias históricas de deuda sin activar FK ni reparar movimientos.
   Costo: ese diagnóstico previo permanece; 0023 sólo agrega políticas y estado operativo.
9. Publicar checkpoints validados en la rama mientras el release sigue en borrador.
   Costo: una preview anterior a 0023 sirve para build y GET sin sesión; la activación
   productiva espera el esquema, la revisión y CI del SHA final.
10. Usar verificaciones y ledger equivalentes en Windows para los helpers POSIX del
    workflow, y conservar este worktree/evidencia para el traspaso pedido. Costo:
    bookkeeping manual y archivos locales de evidencia que permanecen disponibles.
11. Reutilizar el backfill SQL dentro del restore y rechazar identidades ambiguas.
    Costo: un backup ambiguo requiere claves explícitas o nombres inequívocos;
    no se adivinan asignaciones ni se modifica la base parcialmente.
12. Informar resultado sin confirmar ante cualquier fallo del CLI de importación.
    Costo: exige inspección antes de repetir incluso si el fallo fue previo al batch;
    evita asegurar falsamente un rollback después de un commit sin respuesta.

La revisión declinó juzgar los gates remotos, Apps Script vivo, disponibilidad/calidad
real de proveedores, el archivo original no materializado y las referencias de
deuda históricas. Resolución: comprobar los gates con evidencia de release; mantener
Apps Script sin cambios mientras falte respaldo aprobado; usar contratos oficiales
y fallos sintéticos para proveedores; conservar la lectura directa de Library y
no reparar historia fuera del alcance. Los circuitos que sobreviven al restore y
la protección adicional durante rollback son costos aceptados arriba. No se pidió
una segunda revisión ni se delegó la implementación.

`AGENTS.md` del worktree se actualizó localmente con la arquitectura actual; sigue
ignorado y no se fuerza a Git. El archivo del checkout original permanece intacto.

## Apps Script

Chrome y la cuenta `savarole@gmail.com` se verificaron en `wallet-automation`, proyecto
`19s-crKLBFN90ljuoL3dTK3Jh3rR5z-yVpzNBdIdq094zip2J55IgLam3`.
El código generado está versionado y probado. No se guardó ni ejecutó código vivo.
El respaldo previo quedó pendiente: la herramienta publicó la aprobación de descarga
para `https://script.google.com` y no se confirmó un archivo local. No reemplazar
archivos hasta verificar ese respaldo y el backend compatible. No tocar triggers,
propiedades, credenciales, permisos ni scopes. El resultado final se informa por separado.
