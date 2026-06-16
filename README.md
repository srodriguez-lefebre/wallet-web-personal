# Wallet Web Personal

Wallet web personal para controlar gastos, ingresos, cuentas, goals, presupuestos y analiticas.

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
```

En desarrollo local, el unlock acepta un token de al menos 4 caracteres si la API de Vercel no esta corriendo. En deploy, el endpoint `/api/auth/unlock` valida contra `API_TOKEN`.

Para probar la app completa con endpoints reales en local, usar Vercel Dev:

```powershell
npx vercel dev --listen 3001
```

El CLI puede pedir login la primera vez. Una vez levantado, entrar a
`http://localhost:3001` y desbloquear con `API_TOKEN`.

## Deploy

Para Vercel:

- Configurar `DATABASE_URL`.
- Configurar `API_TOKEN`.
- Deployar el repo.

Neon Auth no es necesario para esta version. Neon se usa como PostgreSQL.

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
