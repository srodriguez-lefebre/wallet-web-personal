import * as LabelPrimitive from "@radix-ui/react-label";
import * as SelectPrimitive from "@radix-ui/react-select";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { Check, ChevronDown } from "lucide-react";
import { useId, type ComponentProps, type ReactNode } from "react";

import { cn, limitDecimalPlaces } from "@/lib/utils";

export const controlClassName =
  "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
export const inlineControlClassName =
  "h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
export const colorControlClassName =
  "h-10 w-10 cursor-pointer rounded-full border bg-background p-1 [appearance:none] [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0";
export const textareaClassName =
  "block min-h-24 max-h-64 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [field-sizing:content]";
export const Label = LabelPrimitive.Root;
export function Field({
  label,
  htmlFor,
  description,
  error,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor: string;
  description?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </Label>
      {children}
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(controlClassName, className)} {...props} />;
}
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(textareaClassName, className)} {...props} />;
}
export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}
interface SelectProps<T extends string> {
  value: T | "";
  onValueChange: (value: T) => void;
  options: readonly SelectOption<T>[];
  id?: string;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}
export function Select<T extends string>({
  value,
  onValueChange,
  options,
  id,
  label,
  placeholder = "Choose an option",
  disabled,
  className,
}: SelectProps<T>) {
  // Encode every domain value so an explicit empty/None option remains legal in Radix.
  const encoded = (item: string) => `value:${item}`;
  const selected = options.find((option) => option.value === value);
  return (
    <SelectPrimitive.Root
      value={selected ? encoded(selected.value) : ""}
      disabled={disabled}
      onValueChange={(next) => {
        const option = options.find((item) => encoded(item.value) === next);
        if (option) onValueChange(option.value);
      }}
    >
      <SelectPrimitive.Trigger
        id={id}
        aria-label={label}
        className={cn(
          controlClassName,
          "flex items-center justify-between gap-2 text-left",
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown aria-hidden className="h-4 w-4" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-[70] max-h-80 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border bg-card text-card-foreground shadow-md"
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={encoded(option.value)}
                disabled={option.disabled}
                className="relative flex cursor-default select-none items-center rounded px-3 py-2 pr-8 text-sm outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-secondary"
              >
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-2">
                  <Check aria-hidden className="h-4 w-4" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
type MoneyProps = Omit<ComponentProps<"input">, "type" | "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
  maxDecimals?: number;
  converted?: { label: string; value: string; onValueChange: (value: string) => void };
};
export function MoneyInput({
  value,
  onValueChange,
  maxDecimals = 2,
  converted,
  id,
  ...props
}: MoneyProps) {
  const generated = useId(),
    inputId = id ?? generated;
  return (
    <>
      <Input
        {...props}
        id={inputId}
        inputMode="decimal"
        type="text"
        value={value}
        onChange={(event) => onValueChange(limitDecimalPlaces(event.target.value, maxDecimals))}
      />
      {converted && (
        <Field htmlFor={`${inputId}-converted`} label={converted.label}>
          <Input
            id={`${inputId}-converted`}
            inputMode="decimal"
            type="text"
            disabled={props.disabled}
            value={converted.value}
            onChange={(event) =>
              converted.onValueChange(limitDecimalPlaces(event.target.value, maxDecimals))
            }
          />
        </Field>
      )}
    </>
  );
}
export function DateInput(props: Omit<ComponentProps<"input">, "type">) {
  return <Input {...props} type="date" />;
}
export function DateTimeInput(props: Omit<ComponentProps<"input">, "type">) {
  return <Input {...props} type="datetime-local" />;
}
export function ColorInput(props: Omit<ComponentProps<"input">, "type">) {
  return <Input {...props} type="color" />;
}
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  label,
  tabs = false,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SelectOption<T>[];
  label: string;
  tabs?: boolean;
}) {
  const buttonClass =
    "rounded-md px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
  if (tabs)
    return (
      <TabsPrimitive.Root
        value={value}
        onValueChange={(next) => {
          const option = options.find((item) => item.value === next);
          if (option) onValueChange(option.value);
        }}
      >
        <TabsPrimitive.List
          aria-label={label}
          className="flex flex-wrap gap-1 rounded-lg bg-muted p-1"
        >
          {options.map((option) => (
            <TabsPrimitive.Trigger
              key={option.value}
              value={option.value}
              disabled={option.disabled}
              className={cn(
                buttonClass,
                "data-[state=active]:bg-background data-[state=active]:shadow-sm",
              )}
            >
              {option.label}
            </TabsPrimitive.Trigger>
          ))}
        </TabsPrimitive.List>
      </TabsPrimitive.Root>
    );
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={option.disabled}
          aria-pressed={value === option.value}
          onClick={() => onValueChange(option.value)}
          className={cn(buttonClass, value === option.value && "bg-background shadow-sm")}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
