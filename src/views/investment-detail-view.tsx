import { ArrowLeft, Landmark, TrendingDown, TrendingUp } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "@/components/page/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useWallet } from "@/providers/wallet-provider";
import { formatMoney } from "@shared/calculations";
import { investmentTypeLabels } from "@shared/constants";

export function InvestmentDetailView() {
  const { investmentId } = useParams();
  const navigate = useNavigate();
  const { dataset } = useWallet();
  const investment = dataset.investments.find((item) => item.id === investmentId);

  if (!investment) {
    return (
      <div>
        <PageHeader title="Investment not found" description="This investment does not exist." />
        <Button variant="outline" onClick={() => navigate("/investments")}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>
    );
  }

  const gain = investment.currentValue - investment.amountInvested;
  const gainPercentage = (gain / investment.amountInvested) * 100;
  const performanceValue = (investment.currentValue / investment.amountInvested) * 100;

  return (
    <div>
      <PageHeader
        eyebrow="Investment detail"
        title={investment.name}
        description="Manual investment detail, current performance, and related data."
      >
        <Button variant="outline" onClick={() => navigate("/investments")}>
          <ArrowLeft className="h-4 w-4" />
          Investments
        </Button>
      </PageHeader>

      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-lg bg-primary text-primary-foreground">
                    <Landmark className="h-5 w-5" />
                  </span>
                  <div>
                    <CardTitle>{investment.name}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {investmentTypeLabels[investment.type]} · started {investment.startedAt}
                    </p>
                  </div>
                </div>
                <Badge variant={gain >= 0 ? "success" : "danger"}>
                  {gain >= 0 ? "gain" : "loss"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Progress
                value={Math.min(100, performanceValue)}
                indicatorClassName={gain >= 0 ? "bg-emerald-500" : "bg-red-500"}
              />
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-md bg-secondary p-3">
                  <p className="text-sm text-muted-foreground">Invested</p>
                  <p className="font-semibold">
                    {formatMoney(investment.amountInvested, investment.currency)}
                  </p>
                </div>
                <div className="rounded-md bg-secondary p-3">
                  <p className="text-sm text-muted-foreground">Current value</p>
                  <p className="font-semibold">
                    {formatMoney(investment.currentValue, investment.currency)}
                  </p>
                </div>
                <div className="rounded-md bg-secondary p-3">
                  <p className="text-sm text-muted-foreground">Result</p>
                  <p className={gain >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-red-600"}>
                    {formatMoney(gain, investment.currency)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick read</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-md border p-3">
                <div className="flex items-center gap-2">
                  {gain >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-600" />
                  )}
                  <span className="font-medium">Performance</span>
                </div>
                <span className={gain >= 0 ? "text-emerald-600" : "text-red-600"}>
                  {gainPercentage.toFixed(2)}%
                </span>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-sm text-muted-foreground">Note</p>
                <p className="mt-1 font-medium">{investment.note ?? "No note attached."}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Related info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border p-3">
              <p className="text-sm text-muted-foreground">Currency</p>
              <p className="font-semibold">{investment.currency}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-sm text-muted-foreground">Type</p>
              <p className="font-semibold">{investmentTypeLabels[investment.type]}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-sm text-muted-foreground">Tracking</p>
              <p className="font-semibold">Manual</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

