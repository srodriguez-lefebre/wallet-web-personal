import { register } from "tsx/esm/api";
import { parentPort, workerData } from "node:worker_threads";
import { spawnSync } from "node:child_process";

register();
const { runMailAutomation } = await import("./mail.ts");
const result = runMailAutomation(workerData, (url, options) => {
  // Apps Script UrlFetchApp is synchronous. A worker and a small child keep
  // those semantics while the parent can serve the real ingestion request.
  const child = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    const { url, options } = JSON.parse(input);
    const response = await fetch(url, { method: 'POST', headers: { ...options.headers, 'Content-Type': 'application/json' }, body: options.payload, signal: AbortSignal.timeout(15000) });
    process.stdout.write(JSON.stringify({ status: response.status, body: await response.text() }));
  `,
    ],
    {
      input: JSON.stringify({ url, options }),
      encoding: "utf8",
      timeout: 20_000,
      windowsHide: true,
    },
  );
  if (child.status !== 0)
    throw new Error("Local ingestion request failed or timed out");
  return JSON.parse(child.stdout);
});
parentPort.postMessage(result);
