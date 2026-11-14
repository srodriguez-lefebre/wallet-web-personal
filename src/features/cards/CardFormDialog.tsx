import { currencySchema } from "@shared/schemas";

import type { FormEvent } from "react";
import type { CurrencyCode } from "@shared/types";
import type { CardDraft } from "@/lib/card-draft";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { finishAction } from "@/lib/async-event";

const currencies = currencySchema.options;
const fieldClassName =
  "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: CardDraft;
  editingId: string | null;
  error: string;
  busy: boolean;
  onFieldChange: <K extends keyof CardDraft>(key: K, value: CardDraft[K]) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}
export function CardFormDialog({
  open,
  onOpenChange,
  draft,
  editingId,
  error,
  busy,
  onFieldChange,
  onSubmit,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editingId ? "Edit card" : "New card"}</DialogTitle>
          <DialogDescription>
            Configure the card identity, limit and billing dates.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={(event) => {
            finishAction(onSubmit(event));
          }}
        >
          <label className="space-y-2">
            <span className="text-sm font-medium">Name</span>
            <input
              className={fieldClassName}
              value={draft.name}
              onChange={(e) => onFieldChange("name", e.target.value)}
              placeholder="Itaú Internacional"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Issuer</span>
            <input
              className={fieldClassName}
              value={draft.issuer}
              onChange={(e) => onFieldChange("issuer", e.target.value)}
              placeholder="Itaú"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Last four digits</span>
            <input
              className={fieldClassName}
              value={draft.lastFour}
              onChange={(e) =>
                onFieldChange("lastFour", e.target.value.replace(/\D/g, "").slice(0, 4))
              }
              inputMode="numeric"
              placeholder="4006"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Limit</span>
            <div className="flex gap-2">
              <select
                className={fieldClassName}
                value={draft.limitCurrency}
                onChange={(e) => onFieldChange("limitCurrency", e.target.value as CurrencyCode)}
              >
                {currencies.map((currency) => (
                  <option key={currency}>{currency}</option>
                ))}
              </select>
              <input
                className={fieldClassName}
                type="number"
                min="0"
                step="0.01"
                value={draft.creditLimit}
                onChange={(e) => onFieldChange("creditLimit", e.target.value)}
              />
            </div>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Closing day</span>
            <input
              className={fieldClassName}
              type="number"
              min="1"
              max="31"
              value={draft.closingDay}
              onChange={(e) => onFieldChange("closingDay", e.target.value)}
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Due day</span>
            <input
              className={fieldClassName}
              type="number"
              min="1"
              max="31"
              value={draft.dueDay}
              onChange={(e) => onFieldChange("dueDay", e.target.value)}
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Color</span>
            <input
              className={fieldClassName}
              type="color"
              value={draft.color}
              onChange={(e) => onFieldChange("color", e.target.value)}
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Note</span>
            <input
              className={fieldClassName}
              value={draft.note}
              onChange={(e) => onFieldChange("note", e.target.value)}
            />
          </label>
          {error ? <p className="text-sm text-destructive md:col-span-2">{error}</p> : null}
          <div className="flex gap-2 md:col-span-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving..." : "Save card"}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
