import { useQuery } from "@tanstack/react-query";
import { bankExchangeRateProfileSchema } from "@shared/schemas/card-mail-settings";
import { normalizeCardAlias } from "@shared/mail-normalization";
import { useId, useState } from "react";

import type { BankExchangeRateProfile, CardMailSettings } from "@shared/schemas/card-mail-settings";
import type { Account, CreditCard } from "@shared/types";

import { Field, FormDialog, Input } from "@/components/ui/form";
import { controlClassName } from "@/components/ui/form/controls";
import { Button } from "@/components/ui/button";
import { finishAction } from "@/lib/async-event";
import { useWalletData } from "@/providers/wallet-query-provider";
import { cardMailSettingsQueryOptions } from "@/services/wallet-queries";

const rateLabels = {
  reference: "Other · Current reference (Frankfurter)",
  itau_link: "Itaú · LINK",
  itau_board: "Itaú · Pizarra",
  brou_ebrou: "BROU · eBROU",
  brou_board: "BROU · Pizarra",
  santander_supernet: "Santander · Supernet",
  santander_board: "Santander · Pizarra",
} satisfies Record<BankExchangeRateProfile, string>;
const itauSource = "itau_credit_card";
const automationSource = "automation_wallet";

export function CardMailSettingsDialog({
  card,
  accounts,
  onClose,
}: {
  card: CreditCard;
  accounts: Account[];
  onClose: () => void;
}) {
  const id = useId();
  const { client, mutations } = useWalletData();
  const query = useQuery(cardMailSettingsQueryOptions(client, card.id));
  const [draft, setDraft] = useState<CardMailSettings>();
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const values: CardMailSettings = draft ??
    query.data?.settings ?? {
      source: normalizeCardAlias(card.issuer).includes("ITAU") ? itauSource : automationSource,
      alias: "",
      accountId: null,
      rateProfile: "reference",
    };
  const sourceChoice = [itauSource, automationSource].includes(values.source)
    ? values.source
    : "custom";

  function update(fields: Partial<CardMailSettings>) {
    setDraft({ ...values, ...fields });
    setSaveError("");
  }

  async function save(settings: CardMailSettings | null) {
    if (busy || !query.data?.available) return;
    setBusy(true);
    setSaveError("");
    try {
      await mutations["cards.replaceMailSettings"]({
        params: { id: card.id },
        body: { settings },
      });
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save bank notices.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDialog
      open
      title="Bank notices"
      description={`${card.name} · •••• ${card.lastFour}`}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      error={saveError || query.error?.message}
      busy={busy}
      canSubmit={query.data?.available === true && Boolean(values.source.trim())}
      saveLabel="Save bank notices"
      onSubmit={() => save(values)}
    >
      {query.isPending && <p role="status">Loading bank notices…</p>}
      {query.isError && (
        <Button type="button" variant="outline" onClick={() => finishAction(query.refetch())}>
          Retry
        </Button>
      )}
      {query.data?.available === false && (
        <p className="text-sm text-muted-foreground md:col-span-2">
          Apply the database migration to configure bank notices in Wallet.
        </p>
      )}
      {query.data?.available && (
        <>
          <Field label="Notice source" htmlFor={`${id}-source`}>
            <select
              id={`${id}-source`}
              className={controlClassName}
              value={sourceChoice}
              onChange={(event) =>
                update({ source: event.target.value === "custom" ? "" : event.target.value })
              }
            >
              <option value={itauSource}>Itaú email</option>
              <option value={automationSource}>Automation Wallet</option>
              <option value="custom">Custom source</option>
            </select>
          </Field>
          {sourceChoice === "custom" && (
            <Field label="Source code" htmlFor={`${id}-custom`}>
              <Input
                id={`${id}-custom`}
                value={values.source}
                onChange={(event) => update({ source: event.target.value })}
                maxLength={100}
                required
              />
            </Field>
          )}
          <Field
            label="Alias"
            htmlFor={`${id}-alias`}
            description="For notices without card digits."
          >
            <Input
              id={`${id}-alias`}
              value={values.alias}
              onChange={(event) => update({ alias: event.target.value })}
              maxLength={200}
            />
          </Field>
          <Field label="Account" htmlFor={`${id}-account`}>
            <select
              id={`${id}-account`}
              className={controlClassName}
              value={values.accountId ?? ""}
              onChange={(event) => update({ accountId: event.target.value || null })}
            >
              <option value="">Card only</option>
              {accounts
                .filter(
                  (account) =>
                    (account.isActive && account.isVisible) || account.id === values.accountId,
                )
                .map((account) => (
                  <option key={account.id} value={account.id} disabled={!account.isActive}>
                    {account.name} ({account.currency})
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Exchange rate" htmlFor={`${id}-rate`}>
            <select
              id={`${id}-rate`}
              className={controlClassName}
              value={values.rateProfile}
              onChange={(event) =>
                update({ rateProfile: bankExchangeRateProfileSchema.parse(event.target.value) })
              }
            >
              {bankExchangeRateProfileSchema.options.map((profile) => (
                <option key={profile} value={profile}>
                  {rateLabels[profile]}
                </option>
              ))}
            </select>
          </Field>
          {query.data.settings && (
            <div className="md:col-span-2">
              <Button type="button" variant="outline" onClick={() => finishAction(save(null))}>
                Remove bank notice settings
              </Button>
            </div>
          )}
        </>
      )}
    </FormDialog>
  );
}
