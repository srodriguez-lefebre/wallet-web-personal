import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { PageHeader } from "@/components/page/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWallet } from "@/providers/wallet-provider";

export function ImportsView() {
  const { dataset } = useWallet();
  const [csv, setCsv] = useState(
    "date,description,amount,type\n2026-06-15,Cafe,180,expense\n2026-06-16,Venta,2500,income",
  );

  const preview = useMemo(() => {
    const [header, ...rows] = csv.trim().split(/\r?\n/);
    const columns = header?.split(",") ?? [];
    return rows.map((row) => {
      const values = row.split(",");
      return Object.fromEntries(columns.map((column, index) => [column, values[index] ?? ""]));
    });
  }, [csv]);

  function exportJson() {
    const blob = new Blob([JSON.stringify(dataset, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "wallet-backup.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Imports"
        title="Importaciones"
        description="Importacion CSV, mapeo de columnas, preview y duplicados."
      >
        <Button variant="outline" onClick={exportJson}>
          <Download className="h-4 w-4" />
          Backup JSON
        </Button>
      </PageHeader>

      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              CSV manual
            </CardTitle>
          </CardHeader>
          <CardContent>
            <textarea
              value={csv}
              onChange={(event) => setCsv(event.target.value)}
              className="min-h-72 w-full rounded-md border bg-background p-3 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="mt-3 text-sm text-muted-foreground">
              Esta primera version permite previsualizar y mapear un CSV. La importacion real queda lista para conectar a API.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Preview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-secondary text-left">
                  <tr>
                    {Object.keys(preview[0] ?? {}).map((column) => (
                      <th key={column} className="px-3 py-2 font-medium">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, index) => (
                    <tr key={`${row.date}-${index}`} className="border-t">
                      {Object.values(row).map((value, valueIndex) => (
                        <td key={`${value}-${valueIndex}`} className="px-3 py-2">
                          {value}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
