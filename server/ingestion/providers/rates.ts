import { z } from "zod";

import type { Provider } from "./types.js";
import type { CurrencyCode } from "../../../shared/types.js";

interface RateInput {
  from: CurrencyCode;
  to: CurrencyCode;
  date: Date;
}
export const frankfurterProvider: Provider<RateInput, { rate: number; date: Date }> = {
  name: "frankfurter:rates",
  async call({ from, to, date }, { signal }) {
    const day = date.toISOString().slice(0, 10);
    const url = new URL("https://api.frankfurter.dev/v2/rates");
    url.searchParams.set("base", from);
    url.searchParams.set("quotes", to);
    url.searchParams.set("date", day);
    const response = await fetch(url, { signal });
    if (!response.ok) return { status: "failed", reason: `http_${response.status}` };
    const parsed = z
      .array(
        z.object({
          base: z.literal(from),
          quote: z.literal(to),
          date: z.iso.date(),
          rate: z.number().finite().positive(),
        }),
      )
      .length(1)
      .safeParse(await response.json());
    const quote = parsed.success ? parsed.data[0] : undefined;
    if (!quote || quote.date > day) return { status: "failed", reason: "invalid_rate" };
    return {
      status: "ok",
      value: { rate: quote.rate, date: new Date(`${quote.date}T00:00:00.000Z`) },
    };
  },
};
