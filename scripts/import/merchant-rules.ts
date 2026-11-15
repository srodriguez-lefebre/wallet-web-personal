import { randomUUID } from "node:crypto";

import { z } from "zod";
import { sql } from "drizzle-orm";

import { normalizeMerchantTerm } from "../../shared/mail-normalization.js";
import { merchants, merchantAliases } from "../../server/db/schema.js";

import type { DbClient } from "../../server/db/client.js";

const categoryKeys: Record<string, string[]> = {
  Supermercado: ["groceries", "supermarket"],
  "Estacion de servicio": ["service_station"],
  Comida: ["restaurants"],
  "Farmacia y salud": ["pharmacy"],
  "Servicios publicos": ["services"],
  "Red de cobranza": ["money_services"],
  Transporte: ["public_transport"],
  Vehiculo: ["car"],
  "Ropa y calzado": ["clothing"],
  Tecnologia: ["software"],
  "Hogar y ferreteria": ["hardware"],
  Mascotas: ["unknown_expense"],
  Entretenimiento: ["culture"],
  "Suscripciones digitales": ["subscriptions", "streaming"],
  "Bancos y finanzas": ["bank_fees"],
  Educacion: ["education"],
  Delivery: ["restaurants"],
  "Belleza y cuidado personal": ["wellness"],
  "Deporte y gimnasio": ["fitness"],
  "Viajes y turismo": ["travel"],
  "Procesador de pago": ["unknown_expense"],
  Otros: ["unknown_expense"],
};
export function merchantSourcePath(args: string[], env: Record<string, string | undefined>) {
  const value = args[0] || env.WALLET_MERCHANT_RULES_PATH;
  if (!value?.trim())
    throw new Error("A catalog path argument or WALLET_MERCHANT_RULES_PATH is required");
  return value;
}
export function prepareMerchantImport(
  input: unknown,
  categories: { id: string; systemKey: string | null }[],
) {
  const payload = z
    .object({
      reglas: z
        .array(
          z.object({
            nombre: z.string().trim().min(1),
            categoria: z.string().min(1),
            aliases: z.array(z.string()).default([]),
          }),
        )
        .min(1),
    })
    .parse(input);
  const categoryByKey = new Map(
    categories
      .filter((category) => category.systemKey)
      .map((category) => [category.systemKey, category.id]),
  );
  const names = new Set<string>(),
    owners = new Map<string, string>();
  const aliases: { id: string; merchantId: string; alias: string; normalizedAlias: string }[] = [];
  const rules = payload.reglas.map((rule, index) => {
    if (names.has(rule.nombre)) throw new Error("Duplicate merchant name");
    names.add(rule.nombre);
    const categoryId = (categoryKeys[rule.categoria] ?? ["unknown_expense"])
      .map((key) => categoryByKey.get(key))
      .find(Boolean);
    if (!categoryId) throw new Error("Missing stable category mapping");
    const id = randomUUID();
    for (const term of [rule.nombre, ...rule.aliases]) {
      const normalizedAlias = normalizeMerchantTerm(term);
      if (!normalizedAlias) continue;
      // Preserve legacy catalog exclusions for ambiguous independent words.
      if (normalizedAlias === "PUMA" && rule.categoria === "Estacion de servicio") continue;
      if (normalizedAlias === "PATENTE" && normalizeMerchantTerm(rule.nombre) !== "SUCIVE")
        continue;
      const owner = owners.get(normalizedAlias);
      if (owner && owner !== rule.nombre) throw new Error("Unresolved alias conflict");
      if (!owner) {
        owners.set(normalizedAlias, rule.nombre);
        aliases.push({ id: randomUUID(), merchantId: id, alias: term, normalizedAlias });
      }
    }
    return {
      id,
      name: rule.nombre,
      categoryId,
      priority: payload.reglas.length - index,
      matchMode: "alias" as const,
      isActive: true,
    };
  });
  return { rules, aliases };
}
export async function importMerchantRules(
  db: DbClient,
  prepared: ReturnType<typeof prepareMerchantImport>,
) {
  await db.batch([
    db.execute(sql`LOCK TABLE merchant_aliases,merchants IN ACCESS EXCLUSIVE MODE`),
    db.delete(merchantAliases),
    db.delete(merchants),
    db.insert(merchants).values(prepared.rules),
    db.insert(merchantAliases).values(prepared.aliases),
  ]);
}
