import type { IncomingMessage, ServerResponse } from "node:http";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import handler from "../../api/index.js";

export async function readJson(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2_000_000) throw new Error("Request body exceeds 2 MB");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

export function json(res: ServerResponse, value: unknown, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
}

export async function serveWalletApi(
  req: IncomingMessage,
  res: ServerResponse,
) {
  const url = new URL(req.url!, "http://127.0.0.1");
  const request = req as VercelRequest;
  request.query = Object.fromEntries(url.searchParams);
  request.query.path =
    url.pathname === "/api"
      ? (request.query.path ?? "")
      : url.pathname.replace(/^\/api\//, "");
  request.cookies = {};
  try {
    request.body = await readJson(req);
  } catch {
    json(
      res,
      {
        data: null,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid JSON or body too large",
        },
      },
      400,
    );
    return;
  }
  const response = res as VercelResponse;
  response.status = (status) => {
    res.statusCode = status;
    return response;
  };
  response.json = (value) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(value));
    return response;
  };
  await handler(request, response);
}
