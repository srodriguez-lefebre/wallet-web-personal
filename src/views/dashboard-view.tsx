import { PageHeader } from "@/components/page/page-header";

export function DashboardView() {
  return (
    <PageHeader
      eyebrow="Dashboard"
      title="Estado financiero"
      description="Resumen principal con cuentas visibles, cash flow, spending, ultimos registros y presets."
    />
  );
}
