import {
  ArrowRight,
  Banknote,
  Lock,
  Moon,
  Palette,
  Tags,
  Target,
  Upload,
  WalletCards,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/page/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/auth-provider";
import { useTheme } from "@/providers/theme-provider";
import { useWallet } from "@/providers/wallet-provider";

export function SettingsView() {
  const navigate = useNavigate();
  const { dataset, setRecordFilters } = useWallet();
  const { theme, toggleTheme } = useTheme();
  const { lock } = useAuth();

  function openRecords(filters: Parameters<typeof setRecordFilters>[0]) {
    setRecordFilters(filters);
    navigate("/records");
  }

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Configuracion"
        description="Preferencias generales, seguridad, categorias, etiquetas y accesos de administracion."
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Preferencias
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="font-medium">Moneda principal</p>
                <p className="text-sm text-muted-foreground">Para dashboard y reportes</p>
              </div>
              <Badge>{dataset.settings.primaryCurrency}</Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="font-medium">Tema</p>
                <p className="text-sm text-muted-foreground">Claro principal, oscuro alternativo</p>
              </div>
              <Button variant="outline" onClick={toggleTheme}>
                <Moon className="h-4 w-4" />
                {theme}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Seguridad
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="font-medium">Token local</p>
                <p className="text-sm text-muted-foreground">
                  Bloquear borra el token guardado en este navegador.
                </p>
              </div>
              <Button variant="outline" onClick={lock}>
                Bloquear
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <WalletCards className="h-4 w-4" />
              Categorias
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {dataset.categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() =>
                  openRecords({
                    type: category.type === "income" ? "income" : "expense",
                    categoryId: category.id,
                  })
                }
                className="flex items-center gap-3 rounded-md border p-3 text-left transition hover:border-primary/50 hover:bg-secondary"
              >
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: category.color }}
                />
                <div>
                  <p className="font-medium">{category.name}</p>
                  <p className="text-xs text-muted-foreground">{category.type}</p>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tags className="h-4 w-4" />
              Etiquetas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {dataset.tags.map((tag) => (
                <Badge
                  key={tag.id}
                  style={{ color: tag.color }}
                  variant="muted"
                  className="cursor-pointer transition hover:bg-secondary"
                  onClick={() => openRecords({ tagId: tag.id, type: "all" })}
                >
                  {tag.name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="h-4 w-4" />
              Administracion
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            <Button
              variant="outline"
              className="justify-between"
              onClick={() => navigate("/accounts")}
            >
              Cuentas
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="justify-between"
              onClick={() => navigate("/goals")}
            >
              Objetivos
              <Target className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="justify-between"
              onClick={() => navigate("/investments")}
            >
              Inversiones
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="justify-between"
              onClick={() => navigate("/imports")}
            >
              Imports
              <Upload className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
