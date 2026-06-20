const baseUrl = (process.env.WALLET_BASE_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "");
const masterToken = process.env.API_TOKEN;
const runs = Math.max(1, Math.min(100, Number(process.env.BENCHMARK_RUNS ?? 10)));

if (!masterToken) {
  console.error("API_TOKEN is required. Values are never printed.");
  process.exit(1);
}

const unlock = await fetch(`${baseUrl}/api/auth/unlock`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ token: masterToken }),
});
if (!unlock.ok) throw new Error(`Unlock failed with status ${unlock.status}`);
const sessionToken = (await unlock.json()).data.token;
const samples = [];

for (let index = 0; index < runs; index += 1) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}/api/wallet/bootstrap`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${sessionToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ recordsLimit: 200, recordsCursor: null }),
  });
  const body = await response.arrayBuffer();
  if (!response.ok) throw new Error(`Bootstrap failed with status ${response.status}`);
  samples.push({ durationMs: performance.now() - startedAt, bytes: body.byteLength });
}

const percentile = (values, fraction) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * fraction) - 1];
};

console.log(JSON.stringify({
  runs,
  durationMs: {
    p50: Math.round(percentile(samples.map((sample) => sample.durationMs), 0.5)),
    p95: Math.round(percentile(samples.map((sample) => sample.durationMs), 0.95)),
  },
  payloadBytes: {
    p50: percentile(samples.map((sample) => sample.bytes), 0.5),
    p95: percentile(samples.map((sample) => sample.bytes), 0.95),
  },
}, null, 2));
