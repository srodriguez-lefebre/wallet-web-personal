import type { VercelRequest, VercelResponse } from "@vercel/node";
import { settingsSchema } from "@shared/schemas";
import { guardApi } from "../server/api/guard";
import { routeError, validateBody } from "../server/api/request";
import { sendData } from "../server/api/response";
import { getSettings, upsertSettings } from "../server/db/wallet-repository";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardApi(req, res, ["GET", "PUT"])) return;

  try {
    if (req.method === "PUT") {
      sendData(res, await upsertSettings(validateBody(req, settingsSchema)));
      return;
    }

    sendData(res, await getSettings());
  } catch (error) {
    routeError(res, error);
  }
}
