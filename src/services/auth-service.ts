interface UnlockResponse {
  data: { token: string; expiresAt: string } | null;
  error: { code: string; message: string } | null;
}

export async function createSession(masterToken: string) {
  try {
    const response = await fetch("/api/auth/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: masterToken }),
    });
    const payload = (await response.json()) as UnlockResponse;
    return response.ok && payload.data?.token ? payload.data : null;
  } catch {
    return null;
  }
}
