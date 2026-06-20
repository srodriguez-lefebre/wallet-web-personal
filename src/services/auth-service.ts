import type { ApiOperationId, UnlockRequest, UnlockResult } from "@shared/api-contract";

interface UnlockResponse {
  data: UnlockResult | null;
  error: { code: string; message: string } | null;
}

export async function createSession(masterToken: string) {
  const request: UnlockRequest = { token: masterToken };
  const operationId = "auth.unlock" satisfies ApiOperationId;
  try {
    const response = await fetch("/api/auth/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Client-Operation-Id": operationId },
      body: JSON.stringify(request),
    });
    const payload = (await response.json()) as UnlockResponse;
    return response.ok && payload.data?.token ? payload.data : null;
  } catch {
    return null;
  }
}
