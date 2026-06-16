import type { VercelRequest, VercelResponse } from "@vercel/node";
import { tagSchema } from "@shared/schemas";
import { guardApi } from "../../server/api/guard";
import { routeError, validateBody } from "../../server/api/request";
import { sendData } from "../../server/api/response";
import { createTag, listTags } from "../../server/db/wallet-repository";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardApi(req, res, ["GET", "POST"])) return;

  try {
    if (req.method === "POST") {
      sendData(res, await createTag(validateBody(req, tagSchema)), 201);
      return;
    }

    sendData(res, await listTags());
  } catch (error) {
    routeError(res, error);
  }
}
