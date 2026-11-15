import type { FormEvent, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { finishAction } from "@/lib/async-event";

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children?: ReactNode;
  error?: ReactNode;
  busy?: boolean;
  saveLabel?: string;
  busyLabel?: string;
  canSubmit?: boolean;
  destructive?: boolean;
  className?: string;
  fieldsClassName?: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<unknown> | void;
}
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  error,
  busy = false,
  saveLabel = "Save",
  busyLabel = "Saving...",
  canSubmit = true,
  destructive = false,
  className,
  fieldsClassName = "grid gap-4 md:grid-cols-2",
  onSubmit,
}: FormDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent
        className={className}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy && canSubmit) finishAction(Promise.resolve(onSubmit(event)));
          }}
        >
          <fieldset disabled={busy} className={fieldsClassName}>
            {children}
          </fieldset>
          {error && (
            <div role="alert" className="text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={destructive ? "destructive" : "default"}
              disabled={busy || !canSubmit}
            >
              {busy ? busyLabel : saveLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function ConfirmDialog({
  onConfirm,
  confirmLabel = "Confirm",
  ...props
}: Omit<FormDialogProps, "onSubmit" | "saveLabel" | "children"> & {
  onConfirm: () => Promise<unknown> | void;
  confirmLabel?: string;
}) {
  return (
    <FormDialog {...props} destructive saveLabel={confirmLabel} onSubmit={() => onConfirm()} />
  );
}
