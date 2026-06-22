# Wallet Web Personal

Wallet web personal para controlar gastos, ingresos, cuentas, tarjetas de credito, goals, presupuestos y analiticas.

## Estado actual

La persistencia completa por API cubre cuentas, records, categorias, settings,
deudas, reglas recurrentes, tarjetas, movimientos y pagos de tarjeta. Goals,
reservas, inversiones y tags tienen soporte parcial en repositorio/UI, pero sus
mutaciones del frontend todavia son locales y se pierden al recargar.

El contrato vigente y generado está en [`contracts/openapi.yaml`](contracts/openapi.yaml).
`docs/` contiene roadmap y decisiones de producto; no describe por sí solo el
comportamiento desplegado.

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
El token maestro se intercambia por una sesión firmada de duración limitada.

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

| Método | Ruta | Uso |
|---|---|---|
| `POST` | `/api/auth/unlock` | valida el token maestro y crea una sesión |
| `GET` | `/api/health` | smoke check autenticado |
| `POST` | `/api/wallet/bootstrap` | genera recurrentes y carga el snapshot paginado |
| `GET` | `/api/records` | pagina records por cursor y filtros |

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
