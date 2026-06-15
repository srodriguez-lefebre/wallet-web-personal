import { FormEvent, useState } from "react";
import { LockKeyhole, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/providers/auth-provider";

export function UnlockView() {
  const { unlock } = useAuth();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const ok = await unlock(token);

    if (!ok) {
      setError("Ingresá un token válido para desbloquear la wallet.");
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 text-foreground">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-4 grid h-12 w-12 place-items-center rounded-lg bg-primary text-primary-foreground">
            <WalletCards className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">Desbloquear wallet</CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            Esta app usa un token personal. No hay usuarios ni registro público.
          </p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block space-y-2">
              <span className="text-sm font-medium">Token</span>
              <input
                value={token}
                onChange={(event) => {
                  setToken(event.target.value);
                  setError(null);
                }}
                type="password"
                className="h-11 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                placeholder="Ingresá tu token"
              />
            </label>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button className="w-full" type="submit">
              <LockKeyhole className="h-4 w-4" />
              Entrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
