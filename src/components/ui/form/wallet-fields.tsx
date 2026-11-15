import { useId } from "react";
import { currencySchema } from "@shared/schemas";

import { Field, Select } from "./controls";
import { CategoryCombobox, type CategoryComboboxProps } from "./category-combobox";

import type { Account, CurrencyCode } from "@shared/types";
import type { ComponentProps } from "react";

export function CurrencySelect({
  value,
  onValueChange,
  ...props
}: { value: CurrencyCode; onValueChange: (value: CurrencyCode) => void } & Omit<
  ComponentProps<typeof Select>,
  "options" | "value" | "onValueChange"
>) {
  return (
    <Select
      {...props}
      value={value}
      onValueChange={(next) => onValueChange(currencySchema.parse(next))}
      options={currencySchema.options.map((currency) => ({ value: currency, label: currency }))}
    />
  );
}
export function AccountSelect({
  accounts,
  value,
  onValueChange,
  allowNone = false,
  ...props
}: {
  accounts: Pick<Account, "id" | "name" | "isActive" | "isVisible">[];
  value: string;
  onValueChange: (value: string) => void;
  allowNone?: boolean;
} & Omit<ComponentProps<typeof Select>, "options" | "value" | "onValueChange">) {
  const options = accounts
    .filter((account) => (account.isActive && account.isVisible) || account.id === value)
    .map((account) => ({
      value: account.id,
      label: account.name,
      disabled: !account.isActive || !account.isVisible,
    }));
  return (
    <Select
      {...props}
      value={value}
      onValueChange={onValueChange}
      options={[...(allowNone ? [{ value: "", label: "None", disabled: false }] : []), ...options]}
    />
  );
}
export function CategoryField({
  label = "Category",
  id,
  className,
  enableCreation = true,
  ...props
}: CategoryComboboxProps & { className?: string }) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <Field label={label} htmlFor={inputId} className={className}>
      <CategoryCombobox {...props} id={inputId} label={label} enableCreation={enableCreation} />
    </Field>
  );
}
