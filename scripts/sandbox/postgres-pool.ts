import type { Pool, PoolClient } from "pg";

/** pg-pool.end resolves before socket end; drain both before stopping the server. */
export function trackPoolShutdown(pool: Pool) {
  const connected = new Set<PoolClient>();
  pool.on("connect", (client) => {
    connected.add(client);
    client.once("end", () => connected.delete(client));
  });
  return async () => {
    const disconnected = [...connected].map(
      (client) => new Promise<void>((resolve) => client.once("end", resolve)),
    );
    await pool.end();
    await Promise.all(disconnected);
  };
}
