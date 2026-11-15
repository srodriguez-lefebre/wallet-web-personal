import { Card, CardContent } from "@/components/ui/card";

export function ReadState({ label, error = false }: { label: string; error?: boolean }) {
  return (
    <Card>
      <CardContent
        className="py-12 text-center text-sm text-muted-foreground"
        role={error ? "alert" : "status"}
      >
        {error ? `Could not load ${label}. Retry refresh to continue.` : `Loading ${label}...`}
      </CardContent>
    </Card>
  );
}
