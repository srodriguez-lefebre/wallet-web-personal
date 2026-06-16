import type { VercelRequest, VercelResponse } from "@vercel/node";
import { settingsSchema } from "../shared/schemas.js";
import { guardApi } from "../server/api/guard.js";
import { routeError, validateBody } from "../server/api/request.js";
import { sendData } from "../server/api/response.js";
import { getSettings, upsertSettings } from "../server/db/wallet-repository.js";

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
