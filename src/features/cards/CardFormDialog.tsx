import { useId, type FormEvent } from "react";

import type { CardDraft } from "@/lib/card-draft";

import {
  Field,
  Input,
  Textarea,
  MoneyInput,
  CurrencySelect,
  ColorInput,
  FormDialog,
} from "@/components/ui/form";

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
  const id = useId();
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editingId ? "Edit card" : "New card"}
      description="Configure the card identity, limit and billing dates."
      error={error}
      busy={busy}
      saveLabel="Save card"
      onSubmit={onSubmit}
      className="max-w-2xl"
    >
      <Field label="Name" htmlFor={`${id}-name`}>
        <Input
          id={`${id}-name`}
          value={draft.name}
          onChange={(event) => onFieldChange("name", event.target.value)}
          placeholder="Itaú Internacional"
        />
      </Field>
      <Field label="Issuer" htmlFor={`${id}-issuer`}>
        <Input
          id={`${id}-issuer`}
          value={draft.issuer}
          onChange={(event) => onFieldChange("issuer", event.target.value)}
          placeholder="Itaú"
        />
      </Field>
      <Field label="Last four digits" htmlFor={`${id}-last-four`}>
        <Input
          id={`${id}-last-four`}
          value={draft.lastFour}
          onChange={(event) =>
            onFieldChange("lastFour", event.target.value.replace(/\D/g, "").slice(0, 4))
          }
          inputMode="numeric"
          placeholder="4006"
        />
      </Field>
      <Field label="Limit" htmlFor={`${id}-limit`}>
        <div className="flex gap-2">
          <CurrencySelect
            label="Limit currency"
            value={draft.limitCurrency}
            onValueChange={(value) => onFieldChange("limitCurrency", value)}
          />
          <MoneyInput
            id={`${id}-limit`}
            value={draft.creditLimit}
            onValueChange={(value) => onFieldChange("creditLimit", value)}
          />
        </div>
      </Field>
      <Field label="Closing day" htmlFor={`${id}-closing`}>
        <Input
          id={`${id}-closing`}
          type="number"
          min="1"
          max="31"
          value={draft.closingDay}
          onChange={(event) => onFieldChange("closingDay", event.target.value)}
        />
      </Field>
      <Field label="Due day" htmlFor={`${id}-due`}>
        <Input
          id={`${id}-due`}
          type="number"
          min="1"
          max="31"
          value={draft.dueDay}
          onChange={(event) => onFieldChange("dueDay", event.target.value)}
        />
      </Field>
      <Field label="Color" htmlFor={`${id}-color`}>
        <ColorInput
          id={`${id}-color`}
          value={draft.color}
          onChange={(event) => onFieldChange("color", event.target.value)}
        />
      </Field>
      <Field label="Note" htmlFor={`${id}-note`}>
        <Textarea
          id={`${id}-note`}
          value={draft.note}
          onChange={(event) => onFieldChange("note", event.target.value)}
        />
      </Field>
    </FormDialog>
  );
}
