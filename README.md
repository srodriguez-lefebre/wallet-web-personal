# Wallet Web Personal

Wallet web personal para controlar gastos, ingresos, cuentas, tarjetas de credito, goals, presupuestos y analiticas.

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
npm run db:generate
npm run db:migrate
npm run db:import-wallet-records
npm run db:import-merchant-rules
```

En desarrollo local, el unlock acepta un token de al menos 4 caracteres si la API de Vercel no esta corriendo. En deploy, el endpoint `/api/auth/unlock` valida contra `API_TOKEN`.

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

Antes de usar esta funcionalidad contra una base existente, aplicar la migracion
pendiente con `npm run db:migrate`. La migracion es aditiva y no convierte
automaticamente cuentas antiguas de tipo `credit_card`, porque no contienen el
limite, los ultimos cuatro digitos ni las fechas necesarias.

## Deploy

Para Vercel:

- Configurar `DATABASE_URL`.
- Configurar `API_TOKEN`.
- Deployar el repo.

Neon Auth no es necesario para esta version. Neon se usa como PostgreSQL.

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
