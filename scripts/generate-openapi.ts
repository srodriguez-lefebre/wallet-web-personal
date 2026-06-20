import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { z, type ZodType } from "zod";
import { stringify } from "yaml";
import { apiOperations } from "../shared/api-contract.js";

const root = resolve(import.meta.dirname, "..");
const outputPath = resolve(root, "contracts/openapi.yaml");
const referencePath = resolve(root, "docs/api-reference.md");

function jsonSchema(schema: ZodType | undefined) {
  return schema ? z.toJSONSchema(schema, { unrepresentable: "any" }) : undefined;
}

function parameters(operation: (typeof apiOperations)[number]) {
  const result: unknown[] = [];
  for (const [location, schema] of [["path", operation.params], ["query", operation.query]] as const) {
    const converted = jsonSchema(schema) as { properties?: Record<string, unknown>; required?: string[] } | undefined;
    for (const [name, property] of Object.entries(converted?.properties ?? {})) {
      result.push({ name, in: location, required: location === "path" || converted?.required?.includes(name), schema: property });
    }
  }
  return result;
}

const paths: Record<string, Record<string, unknown>> = {};
for (const operation of apiOperations) {
  const successSchema = jsonSchema(operation.response);
  const responses: Record<string, unknown> = {
    [operation.successStatus]: {
      description: "Success",
      content: { "application/json": { schema: { type: "object", required: ["data", "error"], properties: { data: successSchema, error: { type: "null" } } } } },
    },
  };
  for (const status of operation.errors) {
    responses[status] = {
      description: `Error ${status}`,
      content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } },
    };
  }
  const entry: Record<string, unknown> = {
    operationId: operation.operationId,
    summary: operation.summary,
    tags: [operation.operationId.split(".")[0]],
    "x-stability": operation.stability,
    security: operation.auth === "none" ? [] : [{ [operation.auth === "ingest" ? "ingestBearer" : "sessionBearer"]: [] }],
    responses,
  };
  const operationParameters = parameters(operation);
  if (operationParameters.length) entry.parameters = operationParameters;
  if (operation.body) {
    entry.requestBody = { required: true, content: { "application/json": { schema: jsonSchema(operation.body) } } };
  }
  (paths[operation.path] ??= {})[operation.method.toLowerCase()] = entry;
}

const document = {
  openapi: "3.1.0",
  info: {
    title: "Wallet Web Personal API",
    version: "0.1.0",
    description: "Private pre-1.0 API. Backward compatibility is not guaranteed; frontend and backend change together.",
  },
  servers: [{ url: "/", description: "Current deployment" }],
  paths,
  components: {
    securitySchemes: {
      sessionBearer: { type: "http", scheme: "bearer", description: "Signed session returned by auth.unlock" },
      ingestBearer: { type: "http", scheme: "bearer", description: "Dedicated INGEST_API_TOKEN" },
    },
    schemas: {
      ErrorEnvelope: {
        type: "object",
        required: ["data", "error"],
        properties: {
          data: { type: "null" },
          error: { type: "object", required: ["code", "message"], properties: { code: { type: "string" }, message: { type: "string" } } },
        },
      },
    },
  },
};

const yaml = stringify(document, { lineWidth: 0, sortMapEntries: true });
if (process.argv.includes("--check")) {
  const current = await readFile(outputPath, "utf8").catch(() => "");
  if (current !== yaml) {
    console.error("OpenAPI contract is stale. Run npm run api:spec.");
    process.exitCode = 1;
  }
} else {
  await mkdir(resolve(root, "contracts"), { recursive: true });
  await writeFile(outputPath, yaml, "utf8");
  const lines = ["# API reference", "", "Generated from `shared/api-contract.ts`. The tracked source of truth is `contracts/openapi.yaml`.", "", "| Method | Path | Operation | Auth |", "|---|---|---|---|", ...apiOperations.map((operation) => `| ${operation.method} | \`${operation.path}\` | \`${operation.operationId}\` | ${operation.auth} |`), ""];
  await writeFile(referencePath, lines.join("\n"), "utf8");
}
