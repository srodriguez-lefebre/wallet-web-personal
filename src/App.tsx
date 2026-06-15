import { Activity, Database, LockKeyhole, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const foundations = [
  {
    title: "React + Vite",
    description: "SPA moderna preparada para vistas financieras y routing.",
    icon: Activity,
  },
  {
    title: "API protegida",
    description: "Vercel Functions con token obligatorio para datos privados.",
    icon: LockKeyhole,
  },
  {
    title: "Neon + Drizzle",
    description: "PostgreSQL serverless con migraciones tipadas.",
    icon: Database,
  },
];

export default function App() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-6 py-12">
        <div className="max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-sm text-muted-foreground shadow-soft">
            <WalletCards className="h-4 w-4 text-primary" />
            Wallet Web Personal
          </div>
          <h1 className="text-4xl font-semibold tracking-normal text-foreground sm:text-5xl">
            Base lista para construir el control financiero personal.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
            El proyecto ya esta orientado a una app React con API, base de datos,
            dashboard, registros, goals, presupuestos y analiticas.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button>Comenzar implementacion</Button>
            <Button variant="outline">Ver plan</Button>
          </div>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {foundations.map((item) => (
            <Card key={item.title}>
              <CardHeader>
                <item.icon className="h-5 w-5 text-primary" />
                <CardTitle>{item.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-muted-foreground">
                  {item.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
