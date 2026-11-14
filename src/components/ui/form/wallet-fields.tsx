import { useId } from "react";
import { currencySchema } from "@shared/schemas";

import { Field, Select, controlClassName } from "./controls";

import type { Account, CurrencyCode } from "@shared/types";
import type { ComponentProps } from "react";

import { CategoryPicker, type CategoryPickerItem } from "@/components/wallet/category-picker";

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
export function CategoryField<T extends CategoryPickerItem>({
  label = "Category",
  id,
  categories,
  value,
  onChange,
  getLabel,
}: {
  label?: string;
  id?: string;
  categories: T[];
  value: string;
  onChange: (value: string) => void;
  getLabel?: (category: T) => string;
}) {
  const generated = useId(),
    inputId = id ?? generated;
  return (
    <Field label={label} htmlFor={inputId}>
      <CategoryPicker
        id={inputId}
        categories={categories}
        value={value}
        onChange={onChange}
        getLabel={getLabel}
        inputClassName={controlClassName}
      />
    </Field>
  );
}
